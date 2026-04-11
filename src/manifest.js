const codex = (relativePath) => `plugins/maestro/${relativePath}`;

module.exports = [
  // ── Agents ──────────────────────────────────────────────────────────
  { glob: 'agents/*.md',
    transforms: ['inject-frontmatter', 'agent-stub'],
    runtimes: ['gemini', 'claude'] },
  { glob: 'agents/*.md',
    transforms: ['agent-stub'],
    runtimes: ['codex'] },

  // ── Shared skills ──────────────────────────────────────────────────
  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-discovery-stub'],
    runtimes: ['claude', 'codex'] },

  // ── Canonical source resolver emitted into runtime adapter dirs ────
  { src: 'core/canonical-source.js', transforms: ['copy'], outputs: { gemini: 'hooks/canonical-source.js' } },
  { src: 'core/canonical-source.js', transforms: ['copy'], outputs: { gemini: 'mcp/canonical-source.js' } },
  { src: 'core/canonical-source.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/canonical-source.js' } },
  { src: 'core/canonical-source.js', transforms: ['copy'], outputs: { claude: 'claude/mcp/canonical-source.js' } },
  { src: 'core/canonical-source.js', transforms: ['copy'], outputs: { codex: codex('mcp/canonical-source.js') } },

  // ── MCP public entrypoints ─────────────────────────────────────────
  { src: 'platforms/shared/mcp-entrypoint.js', transforms: ['copy'], outputs: { gemini: 'mcp/maestro-server.js', claude: 'claude/mcp/maestro-server.js', codex: codex('mcp/maestro-server.js') } },

  // ── Hooks — unified runner + per-runtime adapters ──────────────────
  { src: 'platforms/shared/hook-runner.js', transforms: ['copy'], outputs: { gemini: 'hooks/hook-runner.js', claude: 'claude/scripts/hook-runner.js' } },
  { src: 'platforms/shared/adapters/gemini-adapter.js', transforms: ['copy'], outputs: { gemini: 'hooks/adapters/gemini-adapter.js' } },
  { src: 'platforms/shared/adapters/claude-adapter.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/adapters/claude-adapter.js' } },
  { src: 'hooks/hook-configs/gemini.json', transforms: ['copy'], outputs: { gemini: 'hooks/hooks.json' } },
  { src: 'hooks/hook-configs/claude.json', transforms: ['copy'], outputs: { claude: 'claude/hooks/claude-hooks.json' } },

  // ── Platform-specific public assets ────────────────────────────────
  { src: 'platforms/gemini/GEMINI.md', transforms: ['copy'], outputs: { gemini: 'GEMINI.md' } },
  { src: 'platforms/gemini/gemini-extension.json', transforms: ['copy'], outputs: { gemini: 'gemini-extension.json' } },
  { src: 'platforms/gemini/.geminiignore', transforms: ['copy'], outputs: { gemini: '.geminiignore' } },
  { src: 'platforms/gemini/policies/maestro.toml', transforms: ['copy'], outputs: { gemini: 'policies/maestro.toml' } },

  { src: 'platforms/claude/README.md', transforms: ['copy'], outputs: { claude: 'claude/README.md' } },
  { src: 'platforms/claude/.claude-plugin/plugin.json', transforms: ['copy'], outputs: { claude: 'claude/.claude-plugin/plugin.json' } },
  { src: 'platforms/claude/.mcp.json', transforms: ['copy'], outputs: { claude: 'claude/.mcp.json' } },
  { src: 'platforms/claude/mcp-config.example.json', transforms: ['copy'], outputs: { claude: 'claude/mcp-config.example.json' } },
  { src: 'platforms/claude/scripts/policy-enforcer.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/policy-enforcer.js' } },
  { src: 'platforms/claude/scripts/policy-enforcer.test.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/policy-enforcer.test.js' } },

  { src: 'platforms/codex/README.md', transforms: ['copy'], outputs: { codex: codex('README.md') } },
  { src: 'platforms/codex/.codex-plugin/plugin.json', transforms: ['copy'], outputs: { codex: codex('.codex-plugin/plugin.json') } },
  { src: 'platforms/codex/.app.json', transforms: ['copy'], outputs: { codex: codex('.app.json') } },
  { src: 'platforms/codex/.mcp.json', transforms: ['copy'], outputs: { codex: codex('.mcp.json') } },
  { src: 'platforms/codex/references/runtime-guide.md', transforms: ['copy'], outputs: { codex: codex('references/runtime-guide.md') } },
];
