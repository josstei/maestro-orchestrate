'use strict';

module.exports = [
  // ── Agent discovery stubs — Claude and Qwen ────────────────────────
  { glob: 'agents/*.md',
    transforms: ['agent-stub'],
    runtimes: ['claude', 'qwen'] },

  // ── Shared skill discovery stubs — Claude + Codex only ─────────────
  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-discovery-stub'],
    runtimes: ['claude', 'codex'] },
];
