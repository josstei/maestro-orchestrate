'use strict';

const readline = require('node:readline');

const { log, fatal } = require('../lib/core/logger');
const { resolveProjectRoot } = require('../lib/core/project-root-resolver');
const { createServer } = require('../lib/mcp/core/create-server');
const { DEFAULT_TOOL_PACKS } = require('../lib/mcp/tool-packs');

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const SERVER_INFO = Object.freeze({
  name: 'maestro',
  version: '1.5.0',
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

function createProtocolHandlers(server, getProjectRoot, stdout) {
  async function respond(message) {
    if (!message || typeof message !== 'object') {
      return;
    }

    if (typeof message.method !== 'string') {
      return;
    }

    if (message.method === 'initialize') {
      writeMessage(stdout, {
        jsonrpc: '2.0',
        id: message.id,
        result: createInitializeResult(message.params && message.params.protocolVersion),
      });
      return;
    }

    if (
      message.method === 'notifications/initialized' ||
      message.method === 'notifications/cancelled' ||
      message.method === 'notifications/roots/list_changed' ||
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
      const outcome = await server.callTool(name, args, getProjectRoot());

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

  return { respond };
}

function runServer(options = {}) {
  const runtimeConfig = options.runtimeConfig || {};
  const srcRelativePath = options.srcRelativePath || 'src';
  const toolPacks = Array.isArray(options.toolPacks) ? options.toolPacks : DEFAULT_TOOL_PACKS;
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;

  let cachedProjectRoot;
  function getProjectRoot() {
    if (!cachedProjectRoot) {
      cachedProjectRoot = resolveProjectRoot();
    }

    return cachedProjectRoot;
  }

  const server = createServer({
    runtimeConfig,
    services: {
      srcRelativePath,
    },
    toolPacks,
  });

  const { respond } = createProtocolHandlers(server, getProjectRoot, stdout);
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

function main() {
  fatal('maestro-server-core.js must be launched through maestro-server.js');
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_PROTOCOL_VERSION,
  SERVER_INFO,
  createInitializeResult,
  createToolErrorResult,
  createToolSuccessResult,
  runServer,
};
