'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  AGENT_NAMES,
  KNOWN_AGENTS,
  AGENT_CAPABILITIES,
  normalizeAgentName,
  detectAgentFromPrompt,
  getAgentCapability,
} = require('../../src/core/agent-registry');
const { AGENT_COUNT } = require('../support/catalog');
const { withEnv } = require('../support/env');

const VALID_CAPABILITY_LEVELS = ['read_only', 'read_shell', 'read_write', 'full'];

describe('registry constants', () => {
  it('are frozen', () => {
    for (const constant of [AGENT_NAMES, KNOWN_AGENTS, AGENT_CAPABILITIES]) {
      assert.equal(Object.isFrozen(constant), true);
    }
  });

  // match() and replace() also throw on a non-string entry.
  it(`list ${AGENT_COUNT} kebab-case AGENT_NAMES, and KNOWN_AGENTS as the same names in snake_case`, () => {
    assert.equal(KNOWN_AGENTS.length, AGENT_COUNT);
    for (const name of AGENT_NAMES) assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.deepEqual(AGENT_NAMES, KNOWN_AGENTS.map((name) => name.replace(/_/g, '-')));
  });

  it('map every known agent, and nothing else, to a valid capability level', () => {
    assert.deepEqual(Object.keys(AGENT_CAPABILITIES), [...KNOWN_AGENTS]);
    for (const level of Object.values(AGENT_CAPABILITIES)) assert.ok(VALID_CAPABILITY_LEVELS.includes(level), level);
  });
});

const detect = (prompt, env = null) => withEnv({ MAESTRO_CURRENT_AGENT: env }, () => detectAgentFromPrompt(prompt));

// [describe, lookup, [[it title, [[input, expected, MAESTRO_CURRENT_AGENT for detect], ...]], ...]]
const LOOKUP_CASES = [
  ['normalizeAgentName', normalizeAgentName, [
    ['converts kebab-case to snake_case', [['code-reviewer', 'code_reviewer'], ['devops-engineer', 'devops_engineer'],
      ['design-system-engineer', 'design_system_engineer']]],
    ['lowercases input', [['CODER', 'coder'], ['Code-Reviewer', 'code_reviewer'], ['Architect', 'architect']]],
    ['returns empty string for non-string inputs', [[null, ''], [undefined, ''], [42, ''], [{}, '']]],
  ]],
  ['detectAgentFromPrompt', detect, [
    ['finds agent from "agent: coder" header', [['agent: coder\n\nDo some work.', 'coder']]],
    ['finds agent from "agent: code-reviewer" header and normalizes to snake_case',
      [['agent: code-reviewer\n\nReview this PR.', 'code_reviewer']]],
    ['matches @code_reviewer mention', [['Please ask @code_reviewer to check this.', 'code_reviewer']]],
    ['matches "delegate to coder" pattern', [['delegate to coder for implementation', 'coder']]],
    ['matches "hand off to debugger" pattern', [['hand off to debugger for investigation', 'debugger']]],
    ['returns empty string for empty prompt, null prompt, and prompts with no agent',
      [['', ''], [null, ''], ['Just a normal message with no agent.', '']]],
    ['falls back to MAESTRO_CURRENT_AGENT env when no header is present',
      [['Run all tests please.', 'tester', 'tester']]],
    ['prefers header agent over MAESTRO_CURRENT_AGENT env',
      [['agent: coder\n\nImplement the feature.', 'coder', 'tester']]],
  ]],
  ['getAgentCapability', getAgentCapability, [
    ['returns correct capability level for known agents', [['architect', 'read_only'], ['debugger', 'read_shell'],
      ['technical_writer', 'read_write'], ['coder', 'full']]],
    ['accepts kebab-case agent names and normalizes before lookup', [['code-reviewer', 'read_only'],
      ['devops-engineer', 'full'], ['performance-engineer', 'read_shell']]],
    ['returns null for unknown agent names', [['unknown_agent', null], ['', null], ['fake-agent', null]]],
  ]],
];

for (const [suite, lookup, cases] of LOOKUP_CASES) {
  describe(suite, () => {
    for (const [title, pairs] of cases) {
      it(title, () => {
        for (const [input, expected, env] of pairs) assert.equal(lookup(input, env), expected, String(input));
      });
    }
  });
}
