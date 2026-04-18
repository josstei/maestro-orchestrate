'use strict';

const { createToolRegistry } = require('./tool-registry');
const {
  createToolSuccess,
  createUnknownToolFailure,
  normalizeToolError,
  sanitizeErrorMessage,
} = require('./tool-outcome');
const { requireWorkspaceRoot } = require('../../core/project-root-resolver');

function createServer(options = {}) {
  const { runtimeConfig = {}, services = {} } = options;
  const registry = createToolRegistry({
    runtimeConfig,
    services,
    toolPacks: options.toolPacks,
  });

  const postCallHandlers = new Map();

  function invokePostCall(name, outcome, args) {
    const handler = postCallHandlers.get(name);
    if (typeof handler === 'function') {
      try {
        handler(outcome, args);
      } catch {
        // Post-call handlers must not mask tool results.
      }
    }
  }

  return {
    runtimeConfig,
    services,
    toolPacks: registry.toolPacks,
    schemas: registry.schemas,
    handlers: registry.handlers,
    metadata: registry.metadata,
    getToolSchemas() {
      return registry.schemas.slice();
    },
    getToolHandler(name) {
      return registry.handlers[name];
    },
    getToolMetadata(name) {
      return registry.metadata[name] || null;
    },
    onToolCall(name, handler) {
      postCallHandlers.set(name, handler);
    },
    async callTool(name, args = {}, projectRoot) {
      const handler = registry.handlers[name];
      if (!handler) {
        return createUnknownToolFailure(name);
      }
      const meta = registry.metadata[name];
      try {
        if (meta && meta.requiresWorkspace) {
          requireWorkspaceRoot(projectRoot, name);
        }
        const result = await handler(args, projectRoot);
        const outcome = createToolSuccess(result);
        invokePostCall(name, result, args);
        return outcome;
      } catch (error) {
        return normalizeToolError(name, error);
      }
    },
  };
}

module.exports = {
  createServer,
  sanitizeErrorMessage,
};
