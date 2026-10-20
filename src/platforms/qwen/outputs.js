'use strict';

/**
 * What the generator writes for Qwen Code. Build-time only: scripts/generate.js
 * reads it, and no detached payload ships it.
 */

const { MAESTRO_SETTINGS } = require('../../config/settings-catalog');
const { buildPolicyPackToml } = require('./policy-pack');

const HOOK_DESCRIPTIONS = {
  'session-start': 'Initialize hook state and prune stale sessions',
  'before-agent': 'Inject session context into agent turns',
  'after-agent': 'Validate handoff report format with retry on malformed output',
  'session-end': 'Clean up hook state for ended session',
};

const QWEN_HOOK_EVENTS = {
  SessionStart: 'session-start',
  SubagentStart: 'before-agent',
  SubagentStop: 'after-agent',
  SessionEnd: 'session-end',
};

// Qwen Code reads hook timeouts in milliseconds.
function buildQwenHooks() {
  return {
    hooks: Object.fromEntries(Object.entries(QWEN_HOOK_EVENTS).map(([event, hookName]) => [event, [{
      hooks: [{
        type: 'command',
        command: `node \${extensionPath}/hooks/hook-runner.js qwen ${hookName}`,
        name: `maestro-${hookName}-qwen`,
        description: `${HOOK_DESCRIPTIONS[hookName]} (Qwen Code)`,
        timeout: 10000,
      }],
    }]])),
  };
}

module.exports = {
  // The repo root is Qwen Code's extension dir: agent stubs in agents/, TOML
  // commands in commands/maestro/.
  ownedDirs: ['agents', 'commands'],

  // No detached payload: the extension dir is the repo root, which already
  // holds src/.
  payload: null,

  metadataFiles: (context) => [
    ['qwen-extension.json', {
      name: 'maestro',
      version: context.version,
      description: context.description,
      contextFileName: 'QWEN.md',
      settings: MAESTRO_SETTINGS,
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${extensionPath}/mcp/maestro-server.js'],
          cwd: '${extensionPath}',
          env: {
            MAESTRO_WORKSPACE_PATH: '${workspacePath}',
          },
        },
      },
    }],
    ['qwen/hooks.json', buildQwenHooks()],
    // The repo root is Qwen Code's extension dir.
    ['policies/maestro.toml', buildPolicyPackToml()],
  ],
};
