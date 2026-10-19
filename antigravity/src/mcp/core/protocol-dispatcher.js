'use strict';

const { log } = require('../../core/logger');

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';
const DEFAULT_CLIENT_REQUEST_TIMEOUT_MS = 5000;

function writeMessage(output, message) {
  output.write(JSON.stringify(message) + '\n');
}

function toolResult(payload, isError = false) {
  const result = {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
  };

  if (isError) {
    result.isError = true;
  }

  return result;
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

  async function invoke(callback, ...args) {
    if (typeof callback === 'function') {
      await callback(...args);
    }
  }

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

    const { id, method, params } = message;
    if (typeof method !== 'string') {
      return;
    }

    const reply = (result) => writeMessage(stdout, { jsonrpc: '2.0', id, result });

    switch (method) {
      case 'initialize':
        await invoke(callbacks.onInitialize, params || {});
        reply({
          protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo,
        });
        return;

      case 'notifications/initialized':
        await invoke(callbacks.onInitialized);
        return;

      case 'notifications/roots/list_changed':
        await invoke(callbacks.onRootsListChanged);
        return;

      case 'notifications/cancelled':
      case '$/cancelRequest':
        return;

      case 'ping':
        reply({});
        return;

      case 'tools/list':
        reply({ tools: server.getToolSchemas() });
        return;

      case 'tools/call': {
        const name = params && params.name;
        const args =
          params && params.arguments && typeof params.arguments === 'object'
            ? params.arguments
            : {};
        const projectRoot = await getProjectRoot();
        // A failure outcome is already the wire payload plus `ok`.
        const { ok, result, ...failure } = await server.callTool(name, args, projectRoot);

        if (!ok) {
          log('error', `Tool ${name || '(unknown)'} failed: ${failure.error}`);
        }
        reply(ok ? toolResult(result) : toolResult(failure, true));
        return;
      }

      default:
        if (id != null) {
          writeMessage(stdout, {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          });
        }
    }
  }

  return { requestFromClient, respond };
}

module.exports = {
  createProtocolHandlers,
};
