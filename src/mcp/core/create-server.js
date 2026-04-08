'use strict';

const { createToolRegistry } = require('./tool-registry');
const { getRecoveryHint } = require('./recovery-hints');

function sanitizeErrorMessage(error) {
  const message = error && error.message ? error.message : String(error);
  return message.replace(/\/[^\s'"]+/g, '[path]');
}

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
        return {
          ok: false,
          error: `Unknown tool: ${name}`,
          recovery_hint: null,
        };
      }

      try {
        const result = await handler(args, projectRoot);
        return {
          ok: true,
          result,
        };
      } catch (error) {
        const sanitized = sanitizeErrorMessage(error);
        return {
          ok: false,
          error: sanitized,
          recovery_hint: getRecoveryHint(name, sanitized),
        };
      }
    },
  };
}

module.exports = {
  createServer,
  sanitizeErrorMessage,
};
