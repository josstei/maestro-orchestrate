const codex = (relativePath) => `plugins/maestro/${relativePath}`;

module.exports = [
  // ── Agents ──────────────────────────────────────────────────────────
  // Gemini/Claude get runtime-specific frontmatter; all runtimes keep only
  // a stub body that points delegation back through MCP.
  { glob: 'agents/*.md',
    transforms: ['inject-frontmatter', 'agent-stub'],
    runtimes: ['gemini', 'claude'] },
  { glob: 'agents/*.md',
    transforms: ['agent-stub'],
    runtimes: ['codex'] },

  // ── Shared skills ──────────────────────────────────────────────────
  // Gemini loads shared methodology through MCP only; Claude/Codex keep
  // minimal discovery stubs so their skill pickers still surface the names.
  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-discovery-stub'],
    runtimes: ['claude', 'codex'] },

  // ── Shared source lib ───────────────────────────────────────────────
  { glob: 'lib/**/*.js', transforms: ['copy'], runtimes: ['gemini', 'claude', 'codex'],
    exclude: ['lib/mcp/runtime/runtime-config-map.js'] },
  { src: 'lib/mcp/runtime/runtime-config-map.js', transforms: ['inline-runtime'],
    runtimes: ['gemini', 'claude', 'codex'] },

  // ── MCP server ──────────────────────────────────────────────────────
  { src: 'mcp/maestro-server.js', transforms: ['strip-feature'], runtimes: ['gemini', 'claude', 'codex'] },

  // ── Hooks — Gemini runtime only ─────────────────────────────────────
  { src: 'hooks/runtime-only/gemini/hook-adapter.js', transforms: ['copy'], outputs: { gemini: 'hooks/hook-adapter.js' } },
  { src: 'hooks/runtime-only/gemini/after-agent.js', transforms: ['copy'], outputs: { gemini: 'hooks/after-agent.js' } },
  { src: 'hooks/runtime-only/gemini/before-agent.js', transforms: ['copy'], outputs: { gemini: 'hooks/before-agent.js' } },
  { src: 'hooks/runtime-only/gemini/session-start.js', transforms: ['copy'], outputs: { gemini: 'hooks/session-start.js' } },
  { src: 'hooks/runtime-only/gemini/session-end.js', transforms: ['copy'], outputs: { gemini: 'hooks/session-end.js' } },
  { src: 'hooks/hook-configs/gemini.json', transforms: ['copy'], outputs: { gemini: 'hooks/hooks.json' } },

  // ── Hooks — Claude runtime only ─────────────────────────────────────
  { src: 'hooks/runtime-only/claude/hook-adapter.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/hook-adapter.js' } },
  { src: 'hooks/runtime-only/claude/before-agent.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/before-agent.js' } },
  { src: 'hooks/runtime-only/claude/session-start.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/session-start.js' } },
  { src: 'hooks/runtime-only/claude/session-end.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/session-end.js' } },
  { src: 'hooks/hook-configs/claude.json', transforms: ['copy'], outputs: { claude: 'claude/hooks/claude-hooks.json' } },

  // ── Runtime-only: Gemini ────────────────────────────────────────────
  { src: 'runtime-only/gemini/README.md', transforms: ['copy'], outputs: { gemini: 'README.md' } },
  { src: 'runtime-only/gemini/GEMINI.md', transforms: ['copy'], outputs: { gemini: 'GEMINI.md' } },
  { src: 'runtime-only/gemini/gemini-extension.json', transforms: ['copy'], outputs: { gemini: 'gemini-extension.json' } },
  { src: 'runtime-only/gemini/.geminiignore', transforms: ['copy'], outputs: { gemini: '.geminiignore' } },
  { src: 'runtime-only/gemini/policies/maestro.toml', transforms: ['copy'], outputs: { gemini: 'policies/maestro.toml' } },
  { src: 'runtime-only/gemini/commands/maestro/execute.toml', transforms: ['copy'], outputs: { gemini: 'commands/maestro/execute.toml' } },
  { src: 'runtime-only/gemini/commands/maestro/orchestrate.toml', transforms: ['copy'], outputs: { gemini: 'commands/maestro/orchestrate.toml' } },
  { src: 'runtime-only/gemini/commands/maestro/resume.toml', transforms: ['copy'], outputs: { gemini: 'commands/maestro/resume.toml' } },

  // ── Runtime-only: Claude ────────────────────────────────────────────
  { src: 'runtime-only/claude/README.md', transforms: ['copy'], outputs: { claude: 'claude/README.md' } },
  { src: 'runtime-only/claude/.claude-plugin/plugin.json', transforms: ['copy'], outputs: { claude: 'claude/.claude-plugin/plugin.json' } },
  { src: 'runtime-only/claude/.mcp.json', transforms: ['copy'], outputs: { claude: 'claude/.mcp.json' } },
  { src: 'runtime-only/claude/mcp-config.example.json', transforms: ['copy'], outputs: { claude: 'claude/mcp-config.example.json' } },
  { src: 'runtime-only/claude/scripts/policy-enforcer.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/policy-enforcer.js' } },
  { src: 'runtime-only/claude/scripts/policy-enforcer.test.js', transforms: ['copy'], outputs: { claude: 'claude/scripts/policy-enforcer.test.js' } },
  { src: 'runtime-only/claude/skills/execute/SKILL.md', transforms: ['copy'], outputs: { claude: 'claude/skills/execute/SKILL.md' } },
  { src: 'runtime-only/claude/skills/orchestrate/SKILL.md', transforms: ['copy'], outputs: { claude: 'claude/skills/orchestrate/SKILL.md' } },
  { src: 'runtime-only/claude/skills/resume/SKILL.md', transforms: ['copy'], outputs: { claude: 'claude/skills/resume/SKILL.md' } },

  // ── Runtime-only: Codex ─────────────────────────────────────────────
  { src: 'runtime-only/codex/README.md', transforms: ['copy'], outputs: { codex: codex('README.md') } },
  { src: 'runtime-only/codex/.codex-plugin/plugin.json', transforms: ['copy'], outputs: { codex: codex('.codex-plugin/plugin.json') } },
  { src: 'runtime-only/codex/.app.json', transforms: ['copy'], outputs: { codex: codex('.app.json') } },
  { src: 'runtime-only/codex/.mcp.json', transforms: ['copy'], outputs: { codex: codex('.mcp.json') } },
  { src: 'runtime-only/codex/references/runtime-guide.md', transforms: ['copy'], outputs: { codex: codex('references/runtime-guide.md') } },
  { src: 'runtime-only/codex/skills/maestro-execute/SKILL.md', transforms: ['copy'], outputs: { codex: codex('skills/maestro-execute/SKILL.md') } },
  { src: 'runtime-only/codex/skills/maestro-orchestrate/SKILL.md', transforms: ['copy'], outputs: { codex: codex('skills/maestro-orchestrate/SKILL.md') } },
  { src: 'runtime-only/codex/skills/maestro-resume/SKILL.md', transforms: ['copy'], outputs: { codex: codex('skills/maestro-resume/SKILL.md') } },
];
