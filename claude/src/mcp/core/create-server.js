'use strict';

const { getRecoveryHint } = require('./recovery-hints');
const { MaestroError } = require('../../lib/errors');
const { requireWorkspaceRoot } = require('../../core/project-root-resolver');

/**
 * Build a failed tool outcome: `ok: false` plus the error payload the
 * dispatcher puts on the wire. `details` is included only when present.
 */
function toolFailure(error, code, recovery_hint = null, details = null) {
  return { ok: false, error, recovery_hint, code, ...(details != null ? { details } : {}) };
}

function normalizeToolError(toolName, error) {
  if (error instanceof MaestroError) {
    const { message, code, details } = error;
    return toolFailure(message, code, getRecoveryHint(toolName, message, code), details);
  }

  const message = error && error.message ? error.message : String(error);
  const sanitized = message.replace(/\/[^\s'"]+/g, '[path]');
  return toolFailure(sanitized, 'INTERNAL_TOOL_ERROR', getRecoveryHint(toolName, sanitized));
}

/** Build a pack tool (schema plus handler), setting `required` and `requiresWorkspace` if given. */
function defineTool(name, description, properties, handler, options = {}) {
  const { required = [], requiresWorkspace = false } = options;
  return {
    name,
    description,
    ...(requiresWorkspace ? { requiresWorkspace: true } : {}),
    inputSchema: { type: 'object', properties, ...(required.length > 0 ? { required } : {}) },
    handler,
  };
}

/**
 * Compose tool packs into a server that lists tool schemas and dispatches
 * tool calls. A pack is `{ name, tools }` (or a factory receiving the frozen
 * `{ runtimeConfig, services }` context), where each tool is its schema plus a
 * `handler` function, as `defineTool` builds it; the handler is not part of
 * the listed schema. Packs mount in order; tool names must be unique. A runtime
 * config's `mcpToolMeta` is listed as every tool schema's `_meta` (Antigravity
 * loads tools marked `antigravity/alwaysLoad` as native tools, not on demand).
 */
function createServer(options = {}) {
  const { runtimeConfig = {}, services = {}, toolPacks = [] } = options;
  const context = Object.freeze({ runtimeConfig, services });
  const toolMeta = runtimeConfig.mcpToolMeta || null;
  const schemas = [];
  const registry = Object.create(null);

  for (const entry of toolPacks) {
    const pack = typeof entry === 'function' ? entry(context) : entry;
    for (const { handler, ...schema } of pack.tools) {
      if (schema.name in registry) {
        throw new Error(
          `Duplicate tool name "${schema.name}" found in packs "${registry[schema.name].packName}" and "${pack.name}".`
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
  defineTool,
  toolFailure,
};
