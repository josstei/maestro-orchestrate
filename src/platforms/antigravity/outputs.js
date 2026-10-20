'use strict';

/**
 * What the generator writes for Antigravity. Build-time only: scripts/generate.js
 * reads it, and no detached payload ships it.
 */

// Antigravity's plugin cards and Marketplace listing keep descriptions to 160
// characters.
const ANTIGRAVITY_DESCRIPTION = 'Multi-agent development orchestration: 39 specialist subagents, design-plan-execute workflows with persistent sessions, and review, debug and audit skills';

// Antigravity reads hook timeouts in seconds and runs each command from the
// directory holding hooks.json (the plugin root), so script paths are relative.
function antigravityHookCommand(script, timeout) {
  return { type: 'command', command: `node hooks/${script}`, timeout };
}

/**
 * Antigravity hooks.json: named hooks, each mapping events to handlers.
 * SessionStart takes a flat handler list and fires for the main conversation
 * and every subagent conversation, so it carries both the session-start and
 * the session-context (before-agent) handlers. PreToolUse groups handlers
 * under an anchored tool-name matcher. Antigravity has no session-end or
 * post-delegation event.
 */
function buildAntigravityHooks() {
  return {
    'maestro-session': {
      SessionStart: [
        antigravityHookCommand('hook-runner.js antigravity session-start', 10),
        antigravityHookCommand('hook-runner.js antigravity before-agent', 10),
      ],
    },
    'maestro-shell-policy': {
      PreToolUse: [
        { matcher: 'run_command', hooks: [antigravityHookCommand('policy-enforcer.js', 5)] },
      ],
    },
  };
}

module.exports = {
  ownedDirs: ['antigravity/agents', 'antigravity/skills'],

  // src/ prefixes antigravity/src/ ships beyond the shared base. The plugin's
  // hooks run the bundled hook logic through the shared hook and policy
  // runners, and the served script-based state contract runs
  // `node ${PLUGIN_ROOT}/src/scripts/...` against the installed plugin.
  payload: ['scripts/', 'hooks/', 'platforms/shared/'],

  // Antigravity loads only plugin.json's own fields; MCP servers and hooks are
  // read from mcp_config.json and hooks.json at the plugin root.
  metadataFiles: (context) => [
    ['antigravity/plugin.json', {
      name: 'maestro',
      displayName: 'Maestro',
      version: context.version,
      description: ANTIGRAVITY_DESCRIPTION,
      suggestedPrompts: context.defaultPrompts,
    }],
    ['antigravity/mcp_config.json', {
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${PLUGIN_ROOT}/mcp/maestro-server.js'],
        },
      },
    }],
    ['antigravity/hooks.json', buildAntigravityHooks()],
  ],
};
