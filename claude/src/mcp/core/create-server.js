'use strict';

const { getRecoveryHint } = require('./recovery-hints');
const { MaestroError } = require('../../lib/errors');
const { requireWorkspaceRoot } = require('../../core/project-root-resolver');

function resolveToolPack(entry, context, index) {
  const pack = typeof entry === 'function' ? entry(context) : entry;

  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
    throw new TypeError(`Tool pack at index ${index} must resolve to an object.`);
  }

  if (!Array.isArray(pack.tools)) {
    throw new TypeError(`Tool pack at index ${index} must declare a tools array.`);
  }

  return { name: pack.name || `tool-pack-${index + 1}`, tools: pack.tools };
}

function sanitizeErrorMessage(error) {
  const message = error && error.message ? error.message : String(error);
  return message.replace(/\/[^\s'"]+/g, '[path]');
}

/**
 * Build a failed tool outcome: `ok: false` plus the error payload the
 * dispatcher puts on the wire. `details` is included only when present.
 */
function toolFailure(error, code, recovery_hint = null, details = null) {
  const outcome = { ok: false, error, recovery_hint, code };

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
      getRecoveryHint(toolName, error.message, error.code),
      error.details
    );
  }

  const sanitized = sanitizeErrorMessage(error);
  return toolFailure(sanitized, 'INTERNAL_TOOL_ERROR', getRecoveryHint(toolName, sanitized));
}

/**
 * Compose tool packs into a server that lists tool schemas and dispatches
 * tool calls. A pack is `{ name, tools }` (or a factory receiving the frozen
 * `{ runtimeConfig, services }` context), where each tool is its schema plus a
 * `handler` function; the handler is not part of the listed schema. Packs are
 * mounted in order (an unnamed pack is reported as `tool-pack-<n>`); tool
 * names must be unique. A runtime config's `mcpToolMeta` is listed as every
 * tool schema's `_meta` (Antigravity loads tools marked
 * `antigravity/alwaysLoad` as native tools instead of on demand).
 */
function createServer(options = {}) {
  const { runtimeConfig = {}, services = {}, toolPacks = [] } = options;
  const context = Object.freeze({ runtimeConfig, services });
  const toolMeta = runtimeConfig.mcpToolMeta || null;
  const packs = toolPacks.map((entry, index) => resolveToolPack(entry, context, index));
  const schemas = [];
  const registry = Object.create(null);

  for (const pack of packs) {
    for (const tool of pack.tools) {
      if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
        throw new TypeError(`Tool schema in pack "${pack.name}" must be an object.`);
      }

      const { handler, ...schema } = tool;

      if (typeof schema.name !== 'string' || schema.name.length === 0) {
        throw new Error(`Tool schema in pack "${pack.name}" is missing a valid name.`);
      }

      if (schema.name in registry) {
        throw new Error(
          `Duplicate tool name "${schema.name}" found in packs "${registry[schema.name].packName}" and "${pack.name}".`
        );
      }

      if (typeof handler !== 'function') {
        throw new Error(
          `Tool "${schema.name}" in pack "${pack.name}" is missing a handler.`
        );
      }

      registry[schema.name] = {
        packName: pack.name,
        handler,
        requiresWorkspace: schema.requiresWorkspace === true,
      };
      schemas.push(toolMeta ? { ...schema, _meta: { ...toolMeta } } : schema);
    }
  }

  return {
    getToolSchemas() {
      return schemas.slice();
    },
    async callTool(name, args = {}, projectRoot) {
      const tool = registry[name];
      if (!tool) {
        return toolFailure(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
      }
      try {
        if (tool.requiresWorkspace) {
          requireWorkspaceRoot(projectRoot, name);
        }
        return { ok: true, result: await tool.handler(args, projectRoot) };
      } catch (error) {
        return normalizeToolError(name, error);
      }
    },
  };
}

module.exports = {
  createServer,
  toolFailure,
};
