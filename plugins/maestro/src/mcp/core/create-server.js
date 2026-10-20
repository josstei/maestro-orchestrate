'use strict';

const { getRecoveryHint } = require('./recovery-hints');
const { MaestroError } = require('../../lib/errors');
const { requireWorkspaceRoot } = require('../../core/project-root-resolver');

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
      getRecoveryHint(toolName, error.message),
      error.details
    );
  }

  const sanitized = sanitizeErrorMessage(error);
  return toolFailure(sanitized, 'INTERNAL_TOOL_ERROR', getRecoveryHint(toolName, sanitized));
}

/**
 * Build a server that lists `tools` and dispatches calls to them. Each tool
 * is its listed schema plus a `handler(args, projectRoot, context)`, where
 * `context` is `{ runtimeConfig, workspace }` (the session's project-root
 * cache); the handler is not part of the listed schema. A runtime config's
 * `mcpToolMeta` is listed as every tool schema's `_meta` (Antigravity loads
 * tools marked `antigravity/alwaysLoad` as native tools instead of on demand).
 */
function createServer({ runtimeConfig, workspace, tools }) {
  const context = { runtimeConfig, workspace };
  const toolMeta = runtimeConfig.mcpToolMeta;
  const schemas = tools.map(({ handler, ...schema }) => (toolMeta ? { ...schema, _meta: toolMeta } : schema));
  // A JSON-RPC tool name is looked up as a property key, and only listed
  // tools resolve.
  const toolsByName = Object.create(null);
  for (const tool of tools) {
    toolsByName[tool.name] = tool;
  }

  return {
    getToolSchemas: () => schemas,
    async callTool(name, args = {}, projectRoot) {
      const tool = toolsByName[name];
      if (!tool) {
        return toolFailure(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
      }
      try {
        if (tool.requiresWorkspace) {
          requireWorkspaceRoot(projectRoot, name);
        }
        return { ok: true, result: await tool.handler(args, projectRoot, context) };
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
