'use strict';

/**
 * What the generator writes for Claude Code. Build-time only: scripts/generate.js
 * reads it, and no detached payload ships it.
 */

const CLAUDE_HOOKS_PATH = 'hooks/claude-hooks.json';

const DELEGATION_PROTOCOL = '## Protocol\n\nBefore delegating, call `get_skill_content` with resources: ["delegation"] and follow the returned methodology.\n';

// Claude Code reads hook timeouts in seconds.
function claudeHookCommand(script, timeout) {
  return {
    type: 'command',
    command: `node \${CLAUDE_PLUGIN_ROOT}/scripts/${script}`,
    timeout,
  };
}

function buildClaudeHooks() {
  return {
    hooks: {
      SessionEnd: [{ hooks: [claudeHookCommand('hook-runner.js claude session-end', 10)] }],
      SessionStart: [{ hooks: [claudeHookCommand('hook-runner.js claude session-start', 10)] }],
      PreToolUse: [
        { hooks: [claudeHookCommand('hook-runner.js claude before-agent', 10)], matcher: 'Agent' },
        { hooks: [claudeHookCommand('policy-enforcer.js', 5)], matcher: 'Bash' },
      ],
    },
  };
}

module.exports = {
  ownedDirs: ['claude/agents', 'claude/skills'],

  // src/ prefixes claude/src/ ships beyond the shared base: the plugin's hooks
  // run the bundled hook logic through the shared hook and policy runners.
  payload: ['hooks/', 'platforms/shared/'],

  entryPoints: {
    outputPath: (name) => `claude/skills/${name}/SKILL.md`,
    // /review shadows Claude Code's built-in PR review command; debug and
    // resume are reserved defensively.
    reservedNames: ['review', 'debug', 'resume'],
    preamble: {
      // The entry-point template loads the architecture skill itself; entries
      // that delegate add the delegation protocol.
      'entry-point': (entry) => (entry.agents.length > 0 ? DELEGATION_PROTOCOL : ''),
      'core-command': () => '',
    },
  },

  metadataFiles: (context) => [
    ['.claude-plugin/marketplace.json', {
      name: 'maestro-orchestrator',
      owner: {
        name: context.author.name,
      },
      metadata: {
        description: 'Maestro multi-agent orchestration platform for Claude Code',
        version: context.version,
      },
      plugins: [
        {
          name: 'maestro',
          source: './claude',
          description: context.description,
          version: context.version,
          author: context.author,
          homepage: context.homepage,
          repository: context.repository,
          license: context.license,
          keywords: [...context.keywords, 'agents'],
          category: 'productivity',
        },
      ],
    }],
    ['claude/.claude-plugin/plugin.json', {
      name: 'maestro',
      version: context.version,
      description: context.description,
      author: context.author,
      license: context.license,
      hooks: `./${CLAUDE_HOOKS_PATH}`,
      mcpServers: './.mcp.json',
      homepage: context.homepage,
      repository: context.repository,
      keywords: context.keywords,
    }],
    [`claude/${CLAUDE_HOOKS_PATH}`, buildClaudeHooks()],
    ['claude/.mcp.json', {
      mcpServers: {
        maestro: {
          command: 'node',
          args: ['${CLAUDE_PLUGIN_ROOT}/mcp/maestro-server.js'],
          cwd: '${CLAUDE_PLUGIN_ROOT}',
        },
      },
    }],
  ],
};
