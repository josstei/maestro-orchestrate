import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderRosterTable, CAPABILITY_TIER_LABELS } from '../../src/core/roster-renderer.js';

const FAKE_AGENTS = [
  { name: 'zebra-agent', capabilities: 'full', focus: 'Zebra work' },
  { name: 'alpha-agent', capabilities: 'read_only', focus: 'Alpha work' },
];

describe('CAPABILITY_TIER_LABELS', () => {
  it('is frozen', () => {
    assert.equal(Object.isFrozen(CAPABILITY_TIER_LABELS), true);
  });

  it('maps every capability tier to its display label', () => {
    assert.deepEqual(CAPABILITY_TIER_LABELS, {
      read_only: 'Read-only',
      read_shell: 'Read + shell',
      read_write: 'Read + write',
      full: 'Full access',
    });
  });
});

describe('renderRosterTable', () => {
  it('renders an exact table for kebab-case naming, sorted by display name', () => {
    const table = renderRosterTable(FAKE_AGENTS, { agentNaming: 'kebab-case' });

    assert.equal(
      table,
      [
        '| Agent | Focus | Capability Tier |',
        '| --- | --- | --- |',
        '| `alpha-agent` | Alpha work | Read-only |',
        '| `zebra-agent` | Zebra work | Full access |',
      ].join('\n')
    );
  });

  it('renders an exact table for snake_case naming, sorted by display name', () => {
    const table = renderRosterTable(FAKE_AGENTS, { agentNaming: 'snake_case' });

    assert.equal(
      table,
      [
        '| Agent | Focus | Capability Tier |',
        '| --- | --- | --- |',
        '| `alpha_agent` | Alpha work | Read-only |',
        '| `zebra_agent` | Zebra work | Full access |',
      ].join('\n')
    );
  });

  it('does not include a trailing newline', () => {
    const table = renderRosterTable(FAKE_AGENTS, { agentNaming: 'kebab-case' });
    assert.equal(table.endsWith('\n'), false);
  });
});
