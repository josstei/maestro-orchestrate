'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  AGENT_NAMES,
  AGENT_CAPABILITIES,
  normalizeAgentName,
  getAgentCapability,
} = require('../../src/core/agent-registry');
const { toSnakeCase } = require('../../src/lib/naming');
const { AGENT_COUNT } = require('../support/catalog');

const VALID_CAPABILITY_LEVELS = ['read_only', 'read_shell', 'read_write', 'full'];

describe('AGENT_NAMES', () => {
  it(`is frozen and lists the ${AGENT_COUNT} canonical kebab-case names`, () => {
    assert.equal(Object.isFrozen(AGENT_NAMES), true);
    assert.equal(AGENT_NAMES.length, AGENT_COUNT);
    for (const name of AGENT_NAMES) {
      assert.match(name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe('AGENT_CAPABILITIES', () => {
  it('is frozen', () => {
    assert.equal(Object.isFrozen(AGENT_CAPABILITIES), true);
  });

  it('has one entry per agent, keyed by its snake_case name, in registry order', () => {
    assert.deepEqual(Object.keys(AGENT_CAPABILITIES), AGENT_NAMES.map(toSnakeCase));
  });

  it('has only valid capability levels as values', () => {
    for (const [agent, level] of Object.entries(AGENT_CAPABILITIES)) {
      assert.ok(
        VALID_CAPABILITY_LEVELS.includes(level),
        `Invalid capability level '${level}' for agent: ${agent}`
      );
    }
  });
});

describe('normalizeAgentName', () => {
  it('converts kebab-case to snake_case', () => {
    assert.equal(normalizeAgentName('code-reviewer'), 'code_reviewer');
    assert.equal(normalizeAgentName('devops-engineer'), 'devops_engineer');
    assert.equal(normalizeAgentName('design-system-engineer'), 'design_system_engineer');
  });

  it('lowercases input', () => {
    assert.equal(normalizeAgentName('CODER'), 'coder');
    assert.equal(normalizeAgentName('Code-Reviewer'), 'code_reviewer');
    assert.equal(normalizeAgentName('Architect'), 'architect');
  });

  it('returns empty string for non-string inputs', () => {
    assert.equal(normalizeAgentName(null), '');
    assert.equal(normalizeAgentName(undefined), '');
    assert.equal(normalizeAgentName(42), '');
    assert.equal(normalizeAgentName({}), '');
  });
});

describe('getAgentCapability', () => {
  it('returns correct capability level for known agents', () => {
    assert.equal(getAgentCapability('architect'), 'read_only');
    assert.equal(getAgentCapability('debugger'), 'read_shell');
    assert.equal(getAgentCapability('technical_writer'), 'read_write');
    assert.equal(getAgentCapability('coder'), 'full');
  });

  it('accepts kebab-case agent names and normalizes before lookup', () => {
    assert.equal(getAgentCapability('code-reviewer'), 'read_only');
    assert.equal(getAgentCapability('devops-engineer'), 'full');
    assert.equal(getAgentCapability('performance-engineer'), 'read_shell');
  });

  it('returns null for unknown agent names', () => {
    assert.equal(getAgentCapability('unknown_agent'), null);
    assert.equal(getAgentCapability(''), null);
    assert.equal(getAgentCapability('fake-agent'), null);
  });

  it('returns null for names of Object.prototype members', () => {
    assert.equal(getAgentCapability('constructor'), null);
    assert.equal(getAgentCapability('__proto__'), null);
  });
});
