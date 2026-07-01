'use strict';

const TOPOLOGY_DECISION = Object.freeze({
  id: 'phase-0-live-js-source-first',
  date: '2026-06-30',
  mode: 'live-js-source-first',
  canonicalSource: 'src/**/*.js',
  runtimeFormat: 'CommonJS runtime modules loaded directly from generated entrypoints',
  note:
    'AGENTS.md describes a future TypeScript/dist topology, but this checkout packages and runs CommonJS source directly. Payload reduction work targets the live JS topology until a separate topology reconciliation changes the package contract.',
});

const RUNTIME_PAYLOAD_CONTRACT = Object.freeze([
  {
    name: 'gemini',
    startup: {
      manifest: 'gemini-extension.json',
      command: 'node',
      args: ['${extensionPath}/mcp/maestro-server.js'],
      entrypoint: 'mcp/maestro-server.js',
    },
    content: {
      provider: 'filesystem',
      srcRoot: 'src',
      fallback: 'none',
    },
    generatedSurfaces: [
      'agents/',
      'commands/',
      'hooks/',
      'mcp/',
      'policies/',
      'GEMINI.md',
      'gemini-extension.json',
    ],
    detachedPayload: {
      requiredForStartup: false,
      requiredForRelease: false,
      path: null,
    },
    packageInvariants: [
      'gemini-extension.json',
      'mcp/maestro-server.js',
      'src/mcp/maestro-server.js',
    ],
    docs: ['docs/runtime-gemini.md', 'GEMINI.md'],
  },
  {
    name: 'claude',
    startup: {
      manifest: 'claude/.mcp.json',
      command: 'node',
      args: ['${CLAUDE_PLUGIN_ROOT}/claude/mcp/maestro-server.js'],
      entrypoint: 'claude/mcp/maestro-server.js',
    },
    content: {
      provider: 'filesystem',
      srcRoot: 'src',
      fallback: 'none',
    },
    generatedSurfaces: [
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/agents/',
      'claude/hooks/',
      'claude/mcp/',
      'claude/scripts/',
      'claude/skills/',
    ],
    detachedPayload: {
      requiredForStartup: false,
      requiredForRelease: false,
      path: null,
      note:
        'Retired in the no-fallback debt-removal slice. Claude resolves package-root src/ through the public claude/mcp adapter.',
    },
    packageInvariants: [
      '.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/mcp/maestro-server.js',
      'src/mcp/maestro-server.js',
    ],
    docs: ['docs/runtime-claude.md', 'claude/README.md'],
  },
  {
    name: 'codex',
    startup: {
      manifest: 'plugins/maestro/.mcp.json',
      command: 'npx',
      args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
      entrypoint: 'bin/maestro-mcp-server.js',
    },
    content: {
      provider: 'filesystem',
      srcRoot: 'src',
      fallback: 'none',
    },
    generatedSurfaces: [
      '.agents/plugins/marketplace.json',
      'plugins/maestro/.app.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'plugins/maestro/references/',
      'plugins/maestro/skills/',
    ],
    detachedPayload: {
      requiredForStartup: false,
      requiredForRelease: false,
      path: null,
      note:
        'Retired in Phase 1. Codex MCP startup and content loading resolve through the npm package bin and package-root src/.',
    },
    packageInvariants: [
      'bin/maestro-install-codex.js',
      'bin/maestro-mcp-server.js',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'src/mcp/maestro-server.js',
    ],
    docs: ['docs/runtime-codex.md', 'plugins/maestro/references/runtime-guide.md'],
  },
  {
    name: 'qwen',
    startup: {
      manifest: 'qwen-extension.json',
      command: 'node',
      args: ['${extensionPath}/mcp/maestro-server.js'],
      entrypoint: 'mcp/maestro-server.js',
    },
    content: {
      provider: 'filesystem',
      srcRoot: 'src',
      fallback: 'none',
    },
    generatedSurfaces: [
      'qwen/agents/',
      'qwen/hooks.json',
      'QWEN.md',
      'qwen-extension.json',
      'mcp/',
    ],
    detachedPayload: {
      requiredForStartup: false,
      requiredForRelease: false,
      path: null,
    },
    packageInvariants: [
      'qwen-extension.json',
      'qwen/hooks.json',
      'mcp/maestro-server.js',
      'src/mcp/maestro-server.js',
    ],
    docs: ['docs/runtime-qwen.md', 'QWEN.md'],
  },
]);

function getRuntimePayloadContract(runtimeName) {
  return RUNTIME_PAYLOAD_CONTRACT.find((runtime) => runtime.name === runtimeName) || null;
}

module.exports = {
  RUNTIME_PAYLOAD_CONTRACT,
  TOPOLOGY_DECISION,
  getRuntimePayloadContract,
};
