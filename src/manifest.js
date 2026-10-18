'use strict';

module.exports = [
  // ── Agent discovery stubs — Antigravity, Claude, and Qwen ──────────
  { glob: 'agents/*.md',
    transforms: ['agent-stub'],
    runtimes: ['antigravity', 'claude', 'qwen'] },

  // ── Shared skill discovery stubs — Antigravity, Claude, and Codex ──
  { glob: 'skills/shared/**/SKILL.md',
    transforms: ['skill-discovery-stub'],
    runtimes: ['antigravity', 'claude', 'codex'] },
];
