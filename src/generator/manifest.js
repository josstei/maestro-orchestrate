'use strict';

const agentStub = require('./transforms/agent-stub');
const skillDiscoveryStub = require('./transforms/skill-discovery-stub');

// Each rule renders for every runtime whose config declares the field its
// transform reads (`requires`).
module.exports = [
  // ── Agent discovery stubs ──────────────────────────────────────────
  { glob: 'agents/*.md',
    transform: agentStub,
    requires: 'agentFrontmatter' },

  // ── Shared skill discovery stubs ───────────────────────────────────
  { glob: 'skills/shared/**/SKILL.md',
    transform: skillDiscoveryStub,
    requires: 'skillFrontmatter' },
];
