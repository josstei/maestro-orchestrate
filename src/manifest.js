module.exports = [
  // ── Agent discovery stubs — Gemini, Claude, and Qwen ───────────────
  { glob: 'agents/*.md',
    transforms: ['rebuild-frontmatter', 'agent-stub'],
    runtimes: ['gemini', 'claude', 'qwen'] },

  // ── Shared skill discovery stubs — Claude + Codex only ─────────────
  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-discovery-stub'],
    runtimes: ['claude', 'codex'] },
];
