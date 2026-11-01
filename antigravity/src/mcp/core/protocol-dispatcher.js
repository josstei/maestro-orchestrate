'use strict';

const readline = require('node:readline');

const { log } = require('../../core/logger');

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

const toolResult = (payload) => ({ content: [{ type: 'text', text: JSON.stringify(payload) }] });

/**
 * A JSON-RPC 2.0 connection speaking the MCP wire protocol as newline-delimited
 * JSON: `initialize`, `ping`, `tools/list`, `tools/call`, the lifecycle
 * notifications, and server-to-client requests (`requestFromClient`). Unknown
 * methods with an id get -32601. Subclasses supply the tool surface
 * (`getToolSchemas`, `callTool(name, args, projectRoot)`) and may override the
 * project root and the lifecycle hooks.
 */
class McpConnection {
  constructor(output, { serverInfo, clientRequestTimeoutMs = 5000 } = {}) {
    this.output = output;
    this.serverInfo = serverInfo;
    this.clientRequestTimeoutMs = clientRequestTimeoutMs;
    this.pendingClientRequests = new Map();
    this.nextClientRequestId = 1;
  }

  getProjectRoot() {
    return null;
  }

  onInitialize() {}

  onInitialized() {}

  onRootsListChanged() {}

  write(message) {
    this.output.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  }

  /** Respond to each non-empty JSON line of `input`; unparseable lines are logged and dropped. */
  listen(input) {
    return readline.createInterface({ input, crlfDelay: Infinity }).on('line', (line) => {
      if (!line.trim()) {
        return;
      }

      try {
        this.respond(JSON.parse(line)).catch((error) => {
          log('error', `Failed to handle MCP message: ${error.message}`);
        });
      } catch (error) {
        log('error', `Failed to parse MCP message: ${error.message}`);
      }
    });
  }

  requestFromClient(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = `server-${this.nextClientRequestId++}`;
      const timeout = setTimeout(() => {
        this.pendingClientRequests.delete(id);
        reject(new Error(`Timed out waiting for client response to ${method}`));
      }, this.clientRequestTimeoutMs);

      this.pendingClientRequests.set(id, { resolve, reject, timeout });
      this.write({ id, method, params });
    });
  }

  /** Settle the pending client request `message` answers; false when it answers none. */
  settleClientRequest({ id, result, error }) {
    const entry = id != null && this.pendingClientRequests.get(id);
    if (!entry) {
      return false;
    }

    this.pendingClientRequests.delete(id);
    clearTimeout(entry.timeout);
    if (error) {
      entry.reject(new Error(error.message || JSON.stringify(error)));
    } else {
      entry.resolve(result);
    }
    return true;
  }

  async respond(message) {
    if (!message || typeof message !== 'object' || this.settleClientRequest(message)) {
      return;
    }

    const { id, method, params } = message;
    const reply = (result) => this.write({ id, result });

    switch (method) {
      case 'initialize':
        await this.onInitialize(params || {});
        return reply({
          protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: this.serverInfo,
        });

      case 'notifications/initialized':
        return this.onInitialized();

      case 'notifications/roots/list_changed':
        return this.onRootsListChanged();

      case 'notifications/cancelled':
      case '$/cancelRequest':
        return;

      case 'ping':
        return reply({});

      case 'tools/list':
        return reply({ tools: this.getToolSchemas() });

      case 'tools/call': {
        const name = params && params.name;
        const args =
          params && params.arguments && typeof params.arguments === 'object'
            ? params.arguments
            : {};
        const projectRoot = await this.getProjectRoot();
        // A failure outcome is already the wire payload plus `ok`.
        const { ok, result, ...failure } = await this.callTool(name, args, projectRoot);

        if (!ok) {
          log('error', `Tool ${name || '(unknown)'} failed: ${failure.error}`);
        }
        return reply(ok ? toolResult(result) : { ...toolResult(failure), isError: true });
      }

      default:
        if (typeof method === 'string' && id != null) {
          this.write({ id, error: { code: -32601, message: `Method not found: ${method}` } });
        }
    }
  }
}

module.exports = {
  McpConnection,
};
