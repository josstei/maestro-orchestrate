'use strict';

const { MaestroError } = require('../../lib/errors');

// Recovery guidance for a failed call, by tool name and error message.
const RECOVERY_HINTS = [
  {
    tool: 'create_session',
    pattern: /already exists/i,
    hint: 'Call get_session_status to check the current session, then archive_session if you want to start fresh.',
  },
  {
    tool: 'transition_phase',
    pattern: /not found/i,
    hint: 'Call get_session_status to verify the current session and phase IDs.',
  },
  {
    tool: 'update_session',
    pattern: /ENOENT/i,
    hint: 'Call get_session_status to verify a session exists before updating.',
  },
  {
    tool: 'update_session',
    pattern: /updatable field/i,
    hint: 'Provide at least one of: execution_mode, execution_backend, current_batch.',
  },
  {
    tool: 'initialize_workspace',
    pattern: /permission|EACCES|EPERM/i,
    hint: 'Check that the target directory is writable.',
  },
];

function recoveryHint(toolName, message) {
  const row = RECOVERY_HINTS.find((entry) => entry.tool === toolName && entry.pattern.test(message));
  return row ? row.hint : null;
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
      recoveryHint(toolName, error.message),
      error.details
    );
  }

  const sanitized = sanitizeErrorMessage(error);
  return toolFailure(sanitized, 'INTERNAL_TOOL_ERROR', recoveryHint(toolName, sanitized));
}

/**
 * Build a server that lists `tools` and dispatches calls to them. Each tool
 * is its listed schema plus a `handler(args, projectRoot, context)`, where
 * `context` is `{ runtimeConfig, workspace }` and `workspace` is the server's
 * project-root cache; the handler is not part of the listed schema. A tool
 * that sets `requiresWorkspace` fails with WORKSPACE_NOT_INITIALIZED while
 * there is no project root. A runtime config's `mcpToolMeta` is listed as
 * every tool schema's `_meta` (Antigravity loads tools marked
 * `antigravity/alwaysLoad` as native tools instead of on demand).
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
      if (tool.requiresWorkspace && !projectRoot) {
        return toolFailure(
          `${name} requires an initialized workspace. Call initialize_workspace(workspace_path=...) first.`,
          'WORKSPACE_NOT_INITIALIZED',
          null,
          { tool_name: name }
        );
      }
      try {
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
