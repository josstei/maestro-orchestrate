const codex = (relativePath) => `plugins/maestro/${relativePath}`;

module.exports = [
  // ── Codex self-contained runtime payload ───────────────────────────
  { glob: '**/*',
    transforms: ['copy'],
    runtimes: ['codex'],
    preserveSourcePath: true,
    outputBase: 'src' },

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
  { src: 'platforms/gemini/mcp/maestro-server.js', transforms: ['copy'], outputs: { gemini: 'mcp/maestro-server.js' } },
  { src: 'platforms/claude/mcp/maestro-server.js', transforms: ['copy'], outputs: { claude: 'claude/mcp/maestro-server.js' } },
  { src: 'platforms/codex/mcp/maestro-server.js', transforms: ['copy'], outputs: { codex: codex('mcp/maestro-server.js') } },

  // ── Hooks — Gemini runtime only ────────────────────────────────────
  { src: 'platforms/gemini/hooks/hook-adapter.js', transforms: ['copy'], outputs: { gemini: 'hooks/hook-adapter.js' } },
  { src: 'platforms/gemini/hooks/after-agent.js', transforms: ['copy'], outputs: { gemini: 'hooks/after-agent.js' } },
  { src: 'platforms/gemini/hooks/before-agent.js', transforms: ['copy'], outputs: { gemini: 'hooks/before-agent.js' } },
  { src: 'platforms/gemini/hooks/session-start.js', transforms: ['copy'], outputs: { gemini: 'hooks/session-start.js' } },
  { src: 'platforms/gemini/hooks/session-end.js', transforms: ['copy'], outputs: { gemini: 'hooks/session-end.js' } },
  { src: 'hooks/hook-configs/gemini.json', transforms: ['copy'], outputs: { gemini: 'hooks/hooks.json' } },

  // ── Hooks — Claude runtime only ────────────────────────────────────
  { src: 'platforms/claude/scripts/hook-adapter.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/hook-adapter.js' } },
  { src: 'platforms/claude/scripts/before-agent.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/before-agent.js' } },
  { src: 'platforms/claude/scripts/session-start.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/session-start.js' } },
  { src: 'platforms/claude/scripts/session-end.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/session-end.js' } },
  { src: 'hooks/hook-configs/claude.json', transforms: ['copy'], outputs: { claude: 'claude/hooks/claude-hooks.json' } },

  // ── Platform-specific public assets ────────────────────────────────
  { src: 'platforms/gemini/README.md', transforms: ['copy'], outputs: { gemini: 'README.md' } },
  { src: 'platforms/gemini/GEMINI.md', transforms: ['copy'], outputs: { gemini: 'GEMINI.md' } },
  { src: 'platforms/gemini/gemini-extension.json', transforms: ['copy'], outputs: { gemini: 'gemini-extension.json' } },
  { src: 'platforms/gemini/.geminiignore', transforms: ['copy'], outputs: { gemini: '.geminiignore' } },
  { src: 'platforms/gemini/policies/maestro.toml', transforms: ['copy'], outputs: { gemini: 'policies/maestro.toml' } },
  { src: 'platforms/gemini/commands/maestro/execute.toml', transforms: ['copy'], outputs: { gemini: 'commands/maestro/execute.toml' } },
  { src: 'platforms/gemini/commands/maestro/orchestrate.toml', transforms: ['copy'], outputs: { gemini: 'commands/maestro/orchestrate.toml' } },
  { src: 'platforms/gemini/commands/maestro/resume.toml', transforms: ['copy'], outputs: { gemini: 'commands/maestro/resume.toml' } },

  { src: 'platforms/claude/README.md', transforms: ['copy'], outputs: { claude: 'claude/README.md' } },
  { src: 'platforms/claude/.claude-plugin/plugin.json', transforms: ['copy'], outputs: { claude: 'claude/.claude-plugin/plugin.json' } },
  { src: 'platforms/claude/.mcp.json', transforms: ['copy'], outputs: { claude: 'claude/.mcp.json' } },
  { src: 'platforms/claude/mcp-config.example.json', transforms: ['copy'], outputs: { claude: 'claude/mcp-config.example.json' } },
  { src: 'platforms/claude/scripts/policy-enforcer.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/policy-enforcer.js' } },
  { src: 'platforms/claude/scripts/policy-enforcer.test.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/policy-enforcer.test.js' } },
  { src: 'platforms/claude/skills/execute/SKILL.md', transforms: ['copy'], outputs: { claude: 'claude/skills/execute/SKILL.md' } },
  { src: 'platforms/claude/skills/orchestrate/SKILL.md', transforms: ['copy'], outputs: { claude: 'claude/skills/orchestrate/SKILL.md' } },
  { src: 'platforms/claude/skills/resume/SKILL.md', transforms: ['copy'], outputs: { claude: 'claude/skills/resume/SKILL.md' } },

  { src: 'platforms/codex/README.md', transforms: ['copy'], outputs: { codex: codex('README.md') } },
  { src: 'platforms/codex/.codex-plugin/plugin.json', transforms: ['copy'], outputs: { codex: codex('.codex-plugin/plugin.json') } },
  { src: 'platforms/codex/.app.json', transforms: ['copy'], outputs: { codex: codex('.app.json') } },
  { src: 'platforms/codex/.mcp.json', transforms: ['copy'], outputs: { codex: codex('.mcp.json') } },
  { src: 'platforms/codex/references/runtime-guide.md', transforms: ['copy'], outputs: { codex: codex('references/runtime-guide.md') } },
  { src: 'platforms/codex/skills/execute/SKILL.md', transforms: ['copy'], outputs: { codex: codex('skills/execute/SKILL.md') } },
  { src: 'platforms/codex/skills/orchestrate/SKILL.md', transforms: ['copy'], outputs: { codex: codex('skills/orchestrate/SKILL.md') } },
  { src: 'platforms/codex/skills/resume/SKILL.md', transforms: ['copy'], outputs: { codex: codex('skills/resume/SKILL.md') } },
];
