'use strict';

const agentStub = require('./transforms/agent-stub');
const skillDiscoveryStub = require('./transforms/skill-discovery-stub');

module.exports = [
  // ── Agent discovery stubs — Antigravity, Claude, and Qwen ──────────
  { glob: 'agents/*.md',
    transform: agentStub,
    runtimes: ['antigravity', 'claude', 'qwen'] },

  // ── Shared skill discovery stubs — Antigravity, Claude, and Codex ──
  { glob: 'skills/shared/**/SKILL.md',
    transform: skillDiscoveryStub,
    runtimes: ['antigravity', 'claude', 'codex'] },
];
