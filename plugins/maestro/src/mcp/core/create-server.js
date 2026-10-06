'use strict';

const { getRecoveryHint } = require('./recovery-hints');
const { MaestroError } = require('../../lib/errors');
const { requireWorkspaceRoot } = require('../../core/project-root-resolver');

function isObject(value) {
  return Boolean(value) && typeof value === 'object';
}

function normalizeToolPack(entry, context, index) {
  const pack = typeof entry === 'function' ? entry(context) : entry;

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new TypeError(`Tool pack at index ${index} must resolve to an object.`);
  }

  return {
    name: pack.name || `tool-pack-${index + 1}`,
    tools: Array.isArray(pack.tools) ? pack.tools : [],
    handlers: pack.handlers && typeof pack.handlers === 'object' ? pack.handlers : {},
  };
}

function sanitizeErrorMessage(error) {
  const message = error && error.message ? error.message : String(error);
  return message.replace(/\/[^\s'"]+/g, '[path]');
}

function toolFailure(error, code, recovery_hint = null, details = null) {
  const outcome = {
    ok: false,
    error,
    recovery_hint,
  };

  if (code) {
    outcome.code = code;
  }

  if (details != null) {
    outcome.details = details;
  }

  return outcome;
}

function normalizeToolError(toolName, error) {
  if (error instanceof MaestroError) {
    return toolFailure(
      error.message,
      error.code,
      getRecoveryHint(toolName, error.message),
      error.details
    );
  }

  const sanitized = sanitizeErrorMessage(error);
  return toolFailure(sanitized, 'INTERNAL_TOOL_ERROR', getRecoveryHint(toolName, sanitized));
}

/**
 * Compose tool packs into a server that lists tool schemas and dispatches
 * tool calls. Packs are mounted in order; tool names must be unique.
 * `onToolSuccess(name, result)` runs after each successful call and cannot
 * affect the call's outcome.
 */
function createServer(options = {}) {
  const { runtimeConfig = {}, services = {}, toolPacks, onToolSuccess } = options;
  const context = Object.freeze({
    runtimeConfig: isObject(runtimeConfig) ? runtimeConfig : {},
    services: isObject(services) ? services : {},
  });
  const packs = (Array.isArray(toolPacks) ? toolPacks : []).map((entry, index) =>
    normalizeToolPack(entry, context, index)
  );
  const schemas = [];
  const handlers = Object.create(null);
  const toolSources = Object.create(null);
  const requiresWorkspace = Object.create(null);

  for (const pack of packs) {
    for (const schema of pack.tools) {
      if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        throw new TypeError(`Tool schema in pack "${pack.name}" must be an object.`);
      }

      if (typeof schema.name !== 'string' || schema.name.length === 0) {
        throw new Error(`Tool schema in pack "${pack.name}" is missing a valid name.`);
      }

      if (toolSources[schema.name]) {
        throw new Error(
          `Duplicate tool name "${schema.name}" found in packs "${toolSources[schema.name]}" and "${pack.name}".`
        );
      }

      const handler = pack.handlers[schema.name];
      if (typeof handler !== 'function') {
        throw new Error(
          `Tool "${schema.name}" in pack "${pack.name}" is missing a handler.`
        );
      }

      toolSources[schema.name] = pack.name;
      schemas.push(schema);
      handlers[schema.name] = handler;
      requiresWorkspace[schema.name] = schema.requiresWorkspace === true;
    }
  }

  return {
    getToolSchemas() {
      return schemas.slice();
    },
    async callTool(name, args = {}, projectRoot) {
      const handler = handlers[name];
      if (!handler) {
        return toolFailure(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
      }
      try {
        if (requiresWorkspace[name]) {
          requireWorkspaceRoot(projectRoot, name);
        }
        const result = await handler(args, projectRoot);
        if (typeof onToolSuccess === 'function') {
          try {
            onToolSuccess(name, result);
          } catch {
            // Post-call handlers must not mask tool results.
          }
        }
        return { ok: true, result };
      } catch (error) {
        return normalizeToolError(name, error);
      }
    },
  };
}

module.exports = {
  createServer,
  normalizeToolPack,
};
