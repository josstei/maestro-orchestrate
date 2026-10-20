'use strict';

const { ROOT, withIsolatedAntigravityPlugin, withIsolatedClaudePlugin } = require('./helpers');

/**
 * Every MCP server entrypoint a runtime bundle ships: the Qwen (repo-root),
 * Claude, Codex and Antigravity entrypoints in the repo plus isolated copies
 * of the installed Claude and Antigravity plugins (`plugin`). Each is
 * launched by the host named by `runtime`, and `expectSkill` is text its
 * delegation skill content must contain.
 */
const MCP_ENTRYPOINTS = Object.freeze(
  [
    {
      title: 'starts the server from the repo-root (Qwen) entrypoint without external SDK installation',
      relativePath: 'mcp/maestro-server.js',
      runtime: 'qwen',
      expectSkill: '# Delegation Skill',
    },
    {
      title: 'starts the server from the Claude plugin shim without external SDK installation',
      relativePath: 'claude/mcp/maestro-server.js',
      runtime: 'claude',
      expectSkill: 'user-invocable: false',
    },
    {
      title: 'starts the server via the Codex maestro-mcp-server bin',
      relativePath: 'bin/maestro-mcp-server.js',
      runtime: 'codex',
      expectSkill: '# Delegation Skill',
    },
    {
      title: 'starts the server from an isolated installed Claude plugin bundle',
      relativePath: 'mcp/maestro-server.js',
      plugin: 'claude',
      runtime: 'claude',
      expectSkill: 'user-invocable: false',
    },
    {
      title: 'starts the server from the Antigravity repo plugin shim',
      relativePath: 'antigravity/mcp/maestro-server.js',
      runtime: 'antigravity',
      expectSkill: '# Delegation Skill',
    },
    {
      title: 'starts the server from an isolated installed Antigravity plugin',
      relativePath: 'mcp/maestro-server.js',
      plugin: 'antigravity',
      runtime: 'antigravity',
      expectSkill: '# Delegation Skill',
    },
  ].map((entry) => Object.freeze(entry))
);

const PLUGIN_COPIES = Object.freeze({
  antigravity: withIsolatedAntigravityPlugin,
  claude: withIsolatedClaudePlugin,
});

/**
 * Runs `fn` with the directory `entry` is launched from: a fresh isolated
 * copy of its plugin, removed afterwards, or the repo root.
 *
 * @template T
 * @param {{ plugin?: 'claude' | 'antigravity' }} entry - An MCP_ENTRYPOINTS entry
 * @param {(cwd: string) => T | Promise<T>} fn - Callback receiving the launch directory
 * @returns {Promise<T>} The callback's result
 */
async function withEntrypointCwd(entry, fn) {
  const withIsolatedPlugin = PLUGIN_COPIES[entry.plugin];
  return withIsolatedPlugin ? withIsolatedPlugin(fn) : fn(ROOT);
}

module.exports = {
  MCP_ENTRYPOINTS,
  withEntrypointCwd,
};
