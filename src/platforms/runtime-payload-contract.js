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
      command: 'npx',
      args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
      entrypoint: 'bin/maestro-mcp-server.js',
    },
    content: {
      provider: 'filesystem',
      srcRoot: 'src',
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
    packageInvariants: [
      'bin/maestro-mcp-server.js',
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
      command: 'npx',
      args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
      entrypoint: 'bin/maestro-mcp-server.js',
    },
    content: {
      provider: 'filesystem',
      srcRoot: 'src',
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
    packageInvariants: [
      '.claude-plugin/plugin.json',
      'bin/maestro-mcp-server.js',
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
    },
    generatedSurfaces: [
      '.agents/plugins/marketplace.json',
      'plugins/maestro/.app.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'plugins/maestro/references/',
      'plugins/maestro/skills/',
    ],
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
      command: 'npx',
      args: ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server'],
      entrypoint: 'bin/maestro-mcp-server.js',
    },
    content: {
      provider: 'filesystem',
      srcRoot: 'src',
    },
    generatedSurfaces: [
      'qwen/agents/',
      'qwen/hooks.json',
      'QWEN.md',
      'qwen-extension.json',
      'mcp/',
    ],
    packageInvariants: [
      'bin/maestro-mcp-server.js',
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

export { RUNTIME_PAYLOAD_CONTRACT, TOPOLOGY_DECISION, getRuntimePayloadContract };
