import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import registry from '../../src/entry-points/registry.js';
import { AUDIT_PRESENTATION_CONSTRAINTS } from '../../src/entry-points/archetypes/audit-archetype.js';

function entry(name) {
  return registry.find((item) => item.name === name);
}

describe('entry-point registry — audit archetype wiring', () => {
  it('keeps the 10 entries in their canonical order', () => {
    assert.deepEqual(
      registry.map((item) => item.name),
      ['review', 'debug', 'archive', 'status', 'security-audit', 'perf-check', 'seo-audit', 'a11y-audit', 'compliance-check', 'insights']
    );
  });

  it('sources the pure audits from the shared frozen constraint reference', () => {
    for (const name of ['seo-audit', 'a11y-audit', 'compliance-check']) {
      assert.equal(entry(name).constraints, AUDIT_PRESENTATION_CONSTRAINTS);
    }
  });

  it('preserves each audit agent and the delegation skill', () => {
    assert.deepEqual(entry('review').skills, ['delegation', 'code-review']);
    assert.deepEqual(entry('security-audit').agents, ['security-engineer']);
    assert.deepEqual(entry('perf-check').agents, ['performance-engineer']);
    assert.deepEqual(entry('seo-audit').skills, ['delegation']);
  });

  it('remaps review to non-conflicting host names', () => {
    assert.deepEqual(entry('review').runtimeNames, { codex: 'review-code', claude: 'review-code' });
  });

  it('every entry still carries an agents array (delegation-protocol invariant)', () => {
    for (const item of registry) {
      assert.equal(Array.isArray(item.agents), true);
    }
  });
});
