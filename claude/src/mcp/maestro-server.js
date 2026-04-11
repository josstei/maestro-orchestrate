'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { log, fatal } = require('../core/logger');
const { resolveProjectRootForRuntime } = require('../core/project-root-resolver');
const { createServer } = require('./core/create-server');
const { DEFAULT_TOOL_PACKS } = require('./tool-packs');
const { getRuntimeConfig, getDefaultRuntimeConfig } = require('./runtime/runtime-config-map');
const { resolveCanonicalSrcFromExtensionRoot } = require('./utils/extension-root');

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const CLIENT_REQUEST_TIMEOUT_MS = 1000;
const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: '1.6.1',
});

function writeMessage(output, message) {
  output.write(JSON.stringify(message) + '\n');
}

function createInitializeResult(protocolVersion) {
  return {
    protocolVersion: protocolVersion || DEFAULT_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: SERVER_INFO,
  };
}

function createToolErrorResult(error, recoveryHint) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error,
          recovery_hint: recoveryHint,
        }),
      },
    ],
    isError: true,
  };
}

function createToolSuccessResult(result) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result),
      },
    ],
  };
}

function createLineDispatcher(stdin, onMessage) {
  const lineReader = readline.createInterface({
    input: stdin,
    crlfDelay: Infinity,
  });

  lineReader.on('line', (line) => {
    if (!line.trim()) {
      return;
    }

    try {
      onMessage(JSON.parse(line));
    } catch (error) {
      log('error', `Failed to parse MCP message: ${error.message}`);
    }
  });

  return lineReader;
}

function createProtocolHandlers(server, getProjectRoot, stdout, callbacks = {}) {
  const pendingClientRequests = new Map();
  let nextClientRequestId = 1;

  function settleClientRequest(message) {
    if (!message || message.id == null) {
      return false;
    }

    const entry = pendingClientRequests.get(message.id);
    if (!entry) {
      return false;
    }

    pendingClientRequests.delete(message.id);
    clearTimeout(entry.timeout);

    if (message.error) {
      entry.reject(new Error(message.error.message || JSON.stringify(message.error)));
      return true;
    }

    entry.resolve(message.result);
    return true;
  }

  function requestFromClient(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = `server-${nextClientRequestId++}`;
      const timeout = setTimeout(() => {
        pendingClientRequests.delete(id);
        reject(new Error(`Timed out waiting for client response to ${method}`));
      }, CLIENT_REQUEST_TIMEOUT_MS);

      pendingClientRequests.set(id, { resolve, reject, timeout });
      writeMessage(stdout, {
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
    });
  }

  async function respond(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (settleClientRequest(message)) {
      return;
    }

    if (typeof message.method !== 'string') {
      return;
    }

    if (message.method === 'initialize') {
      if (typeof callbacks.onInitialize === 'function') {
        await Promise.resolve(callbacks.onInitialize(message.params || {}));
      }

      writeMessage(stdout, {
        jsonrpc: '2.0',
        id: message.id,
        result: createInitializeResult(message.params && message.params.protocolVersion),
      });
      return;
    }

    if (message.method === 'notifications/initialized') {
      if (typeof callbacks.onInitialized === 'function') {
        await Promise.resolve(callbacks.onInitialized());
      }
      return;
    }

    if (message.method === 'notifications/roots/list_changed') {
      if (typeof callbacks.onRootsListChanged === 'function') {
        await Promise.resolve(callbacks.onRootsListChanged());
      }
      return;
    }

    if (
      message.method === 'notifications/cancelled' ||
      message.method === '$/cancelRequest'
    ) {
      return;
    }

    if (message.method === 'ping') {
      writeMessage(stdout, {
        jsonrpc: '2.0',
        id: message.id,
        result: {},
      });
      return;
    }

    if (message.method === 'tools/list') {
      writeMessage(stdout, {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: server.getToolSchemas(),
        },
      });
      return;
    }

    if (message.method === 'tools/call') {
      const name = message.params && message.params.name;
      const args =
        message.params && message.params.arguments && typeof message.params.arguments === 'object'
          ? message.params.arguments
          : {};
      const projectRoot = await getProjectRoot();
      const outcome = await server.callTool(name, args, projectRoot);

      if (outcome.ok) {
        writeMessage(stdout, {
          jsonrpc: '2.0',
          id: message.id,
          result: createToolSuccessResult(outcome.result),
        });
        return;
      }

      log('error', `Tool ${name || '(unknown)'} failed: ${outcome.error}`);
      writeMessage(stdout, {
        jsonrpc: '2.0',
        id: message.id,
        result: createToolErrorResult(outcome.error, outcome.recovery_hint),
      });
      return;
    }

    if (message.id == null) {
      return;
    }

    writeMessage(stdout, {
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32601,
        message: `Method not found: ${message.method}`,
      },
    });
  }

  return { requestFromClient, respond };
}

function normalizeRuntimeConfig(runtimeConfig) {
  if (!runtimeConfig) {
    return getDefaultRuntimeConfig();
  }

  if (typeof runtimeConfig === 'string') {
    return getRuntimeConfig(runtimeConfig);
  }

  if (typeof runtimeConfig === 'object' && runtimeConfig.name) {
    return runtimeConfig;
  }

  return getDefaultRuntimeConfig();
}

function runRuntimeServer(runtimeConfig, options = {}) {
  const resolvedRuntimeConfig = normalizeRuntimeConfig(runtimeConfig);
  const canonicalSrcRoot = options.canonicalSrcRoot || resolveCanonicalSrcFromExtensionRoot();
  const toolPacks = Array.isArray(options.toolPacks) ? options.toolPacks : DEFAULT_TOOL_PACKS;
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;

  let cachedProjectRoot;
  let cachedClientRoots;
  let clientRootsPromise;
  let clientSupportsRoots = false;

  function hasExplicitWorkspaceEnv() {
    const workspaceEnvName =
      resolvedRuntimeConfig && resolvedRuntimeConfig.env
        ? resolvedRuntimeConfig.env.workspacePath
        : null;
    const workspaceEnvValue = workspaceEnvName ? process.env[workspaceEnvName] : null;
    if (!workspaceEnvValue || workspaceEnvValue.includes('${')) {
      return false;
    }

    return fs.existsSync(path.resolve(workspaceEnvValue));
  }

  async function fetchClientRoots(force = false) {
    if (hasExplicitWorkspaceEnv()) {
      return [];
    }

    if (!clientSupportsRoots) {
      return [];
    }

    if (cachedClientRoots !== undefined && !force) {
      return cachedClientRoots;
    }

    if (clientRootsPromise && !force) {
      return clientRootsPromise;
    }

    clientRootsPromise = requestFromClient('roots/list', {})
      .then((result) => {
        const roots =
          result && Array.isArray(result.roots)
            ? result.roots
            : [];
        cachedClientRoots = roots;
        return roots;
      })
      .catch(() => {
        cachedClientRoots = [];
        return cachedClientRoots;
      })
      .finally(() => {
        clientRootsPromise = null;
      });

    return clientRootsPromise;
  }

  async function getProjectRoot() {
    if (!cachedProjectRoot) {
      const clientRoots = hasExplicitWorkspaceEnv() ? [] : await fetchClientRoots();
      cachedProjectRoot = resolveProjectRootForRuntime(resolvedRuntimeConfig, {
        env: process.env,
        clientRoots,
        cwd: process.cwd(),
      });
    }

    return cachedProjectRoot;
  }

  const server = createServer({
    runtimeConfig: resolvedRuntimeConfig,
    services: {
      canonicalSrcRoot,
    },
    toolPacks,
  });

  const { requestFromClient, respond } = createProtocolHandlers(server, getProjectRoot, stdout, {
    onInitialize(params) {
      clientSupportsRoots = Boolean(
        params &&
          params.capabilities &&
          params.capabilities.roots
      );
    },
    async onInitialized() {
      if (!hasExplicitWorkspaceEnv()) {
        await fetchClientRoots(true);
        cachedProjectRoot = undefined;
      }
    },
    onRootsListChanged() {
      cachedClientRoots = undefined;
      clientRootsPromise = null;
      cachedProjectRoot = undefined;
    },
  });
  const lineReader = createLineDispatcher(stdin, (message) => {
    Promise.resolve(respond(message)).catch((error) => {
      log('error', `Failed to handle MCP message: ${error.message}`);
    });
  });

  log('info', 'MCP server starting');
  log('info', 'MCP server connected');

  return {
    close() {
      lineReader.close();
    },
    server,
  };
}

function main(runtimeConfig) {
  const resolved = runtimeConfig || process.env.MAESTRO_RUNTIME || getDefaultRuntimeConfig();
  runRuntimeServer(resolved);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    fatal(error && error.message ? error.message : String(error));
  }
}

module.exports = {
  DEFAULT_PROTOCOL_VERSION,
  SERVER_INFO,
  createInitializeResult,
  createToolErrorResult,
  createToolSuccessResult,
  normalizeRuntimeConfig,
  runRuntimeServer,
  main,
};
