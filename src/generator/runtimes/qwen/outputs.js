'use strict';

/** What the generator writes for Qwen Code. */

const { MAESTRO_SETTINGS } = require('../../../config/settings-catalog');
const { buildPolicyPackToml } = require('./policy-pack');

// Qwen Code runs the !{...} shell block when the command is invoked, so
// resume starts from the active session's state.
const SESSION_STATE_BLOCK = `The current session state is provided below:

<session-state>
!{extension_root="\${MAESTRO_EXTENSION_PATH:-$HOME/.qwen/extensions/maestro}"; script="$extension_root/src/scripts/read-active-session.js"; if [[ -f "$script" ]]; then node "$script"; else echo "No active session"; fi}
</session-state>

Use the injected session state above as the source of truth for resume position.

`;

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

  entryPoints: {
    outputPath: (name) => `commands/maestro/${name}.toml`,
    // Qwen Code reserves none of the registry names.
    reservedNames: [],
    preamble: {
      'entry-point': (entry, { skillContentLine }) => skillContentLine,
      'core-command': (entry) => (entry.name === 'resume' ? SESSION_STATE_BLOCK : ''),
    },
  },

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
