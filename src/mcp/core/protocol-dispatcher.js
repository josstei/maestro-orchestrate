'use strict';

const { log } = require('../../core/logger');

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_CLIENT_REQUEST_TIMEOUT_MS = 5000;

function writeMessage(output, message) {
  output.write(JSON.stringify(message) + '\n');
}

function buildInitializeResult(protocolVersion, serverInfo) {
  return {
    protocolVersion: protocolVersion || DEFAULT_PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo,
  };
}

function createToolErrorResult(errorOrOutcome, recoveryHint) {
  const outcome =
    errorOrOutcome &&
    typeof errorOrOutcome === 'object' &&
    !Array.isArray(errorOrOutcome) &&
    Object.prototype.hasOwnProperty.call(errorOrOutcome, 'error')
      ? errorOrOutcome
      : { error: errorOrOutcome, recovery_hint: recoveryHint };

  const payload = {
    error: outcome.error,
    recovery_hint: outcome.recovery_hint ?? null,
  };

  if (outcome.code) {
    payload.code = outcome.code;
  }

  if (outcome.details !== undefined) {
    payload.details = outcome.details;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
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

/**
 * Create a JSON-RPC 2.0 dispatcher for the MCP wire protocol.
 *
 * Handles `initialize`, `tools/list`, `tools/call`, `ping`, notification
 * methods, and outbound server-to-client requests (via `requestFromClient`).
 * Unknown methods get a -32601 response.
 *
 * @returns {{
 *   requestFromClient: (method: string, params?: object) => Promise<any>,
 *   respond: (message: object) => Promise<void>
 * }}
 */
function createProtocolHandlers(server, getProjectRoot, stdout, options = {}) {
  const {
    serverInfo,
    callbacks = {},
    clientRequestTimeoutMs = DEFAULT_CLIENT_REQUEST_TIMEOUT_MS,
  } = options;

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
      }, clientRequestTimeoutMs);

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
        result: buildInitializeResult(
          message.params && message.params.protocolVersion,
          serverInfo
        ),
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
      let projectRoot = null;
      try {
        projectRoot = await getProjectRoot();
      } catch (error) {
        if (error && error.code !== 'WORKSPACE_NOT_INITIALIZED') {
          log(
            'warn',
            `getProjectRoot failed unexpectedly while handling ${name || '(unknown)'}: ${error.message}`
          );
        }
        projectRoot = null;
      }
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
        result: createToolErrorResult(outcome),
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

  /**
   * Clear all pending outbound client-request timeouts and reject their
   * promises. Call during server shutdown so Node can exit promptly and
   * callers do not receive late timeout rejections.
   */
  function drain() {
    for (const [id, entry] of pendingClientRequests) {
      clearTimeout(entry.timeout);
      entry.reject(new Error(`MCP server closing; request ${id} aborted`));
    }
    pendingClientRequests.clear();
  }

  return { requestFromClient, respond, drain };
}

module.exports = {
  DEFAULT_PROTOCOL_VERSION,
  DEFAULT_CLIENT_REQUEST_TIMEOUT_MS,
  writeMessage,
  buildInitializeResult,
  createToolErrorResult,
  createToolSuccessResult,
  createProtocolHandlers,
};
