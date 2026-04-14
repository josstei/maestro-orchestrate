'use strict';

const { createToolRegistry } = require('./tool-registry');
const {
  createToolSuccess,
  createUnknownToolFailure,
  normalizeToolError,
  sanitizeErrorMessage,
} = require('./tool-outcome');

function createServer(options = {}) {
  const { runtimeConfig = {}, services = {} } = options;
  const registry = createToolRegistry({
    runtimeConfig,
    services,
    toolPacks: options.toolPacks,
  });

  return {
    runtimeConfig,
    services,
    toolPacks: registry.toolPacks,
    schemas: registry.schemas,
    handlers: registry.handlers,
    getToolSchemas() {
      return registry.schemas.slice();
    },
    getToolHandler(name) {
      return registry.handlers[name];
    },
    async callTool(name, args = {}, projectRoot) {
      const handler = registry.handlers[name];
      if (!handler) {
        return createUnknownToolFailure(name);
      }

      try {
        const result = await handler(args, projectRoot);
        return createToolSuccess(result);
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
