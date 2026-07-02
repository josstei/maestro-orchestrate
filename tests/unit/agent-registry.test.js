'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  KNOWN_AGENTS,
  AGENT_CAPABILITIES,
  normalizeAgentName,
  detectAgentFromPrompt,
  getAgentCapability,
  canCreateFiles,
} = require('../../src/core/agent-registry');
const agentRegistryData = require('../../src/generated/agent-registry.json');

const VALID_CAPABILITY_LEVELS = ['read_only', 'read_shell', 'read_write', 'full'];
const LEGACY_AGENT_ENV = ['MAESTRO', 'CURRENT', 'AGENT'].join('_');

describe('KNOWN_AGENTS', () => {
  it('is frozen', () => {
    assert.equal(Object.isFrozen(KNOWN_AGENTS), true);
  });

  it('has exactly 39 entries', () => {
    assert.equal(KNOWN_AGENTS.length, 39);
  });

  it('contains only strings', () => {
    for (const entry of KNOWN_AGENTS) {
      assert.equal(typeof entry, 'string');
    }
  });
});

describe('AGENT_CAPABILITIES', () => {
  it('is frozen', () => {
    assert.equal(Object.isFrozen(AGENT_CAPABILITIES), true);
  });

  it('has a capability entry for every known agent', () => {
    for (const agent of KNOWN_AGENTS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(AGENT_CAPABILITIES, agent),
        `Missing capability for agent: ${agent}`
      );
    }
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

describe('agent-registry.json focus field', () => {
  it('every agent carries a non-empty focus line', () => {
    for (const entry of agentRegistryData) {
      assert.equal(typeof entry.focus, 'string', `Missing focus for agent: ${entry.name}`);
      assert.ok(entry.focus.trim().length > 0, `Empty focus for agent: ${entry.name}`);
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

describe('detectAgentFromPrompt', () => {
  it('finds agent from "agent: coder" header', () => {
    assert.equal(detectAgentFromPrompt('agent: coder\n\nDo some work.'), 'coder');
  });

  it('finds agent from "agent: code-reviewer" header and normalizes to snake_case', () => {
    assert.equal(
      detectAgentFromPrompt('agent: code-reviewer\n\nReview this PR.'),
      'code_reviewer'
    );
  });

  it('ignores @mentions when no Agent header is present', () => {
    assert.equal(detectAgentFromPrompt('Please ask @code_reviewer to check this.'), '');
  });

  it('ignores natural-language delegation phrases when no Agent header is present', () => {
    assert.equal(detectAgentFromPrompt('delegate to coder for implementation'), '');
    assert.equal(detectAgentFromPrompt('hand off to debugger for investigation'), '');
  });

  it('returns empty string for empty prompt, null prompt, and prompts with no agent', () => {
    assert.equal(detectAgentFromPrompt(''), '');
    assert.equal(detectAgentFromPrompt(null), '');
    assert.equal(detectAgentFromPrompt('Just a normal message with no agent.'), '');
  });

  it('ignores legacy agent env when no Agent header is present', () => {
    const previous = process.env[LEGACY_AGENT_ENV];
    process.env[LEGACY_AGENT_ENV] = 'tester';
    try {
      assert.equal(detectAgentFromPrompt('Run all tests please.'), '');
    } finally {
      if (previous === undefined) {
        delete process.env[LEGACY_AGENT_ENV];
      } else {
        process.env[LEGACY_AGENT_ENV] = previous;
      }
    }
  });

  it('ignores unknown Agent headers', () => {
    assert.equal(detectAgentFromPrompt('Agent: not-a-real-agent\n\nRun work.'), '');
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
});

describe('canCreateFiles', () => {
  it('returns true for read_write agents', () => {
    assert.equal(canCreateFiles('technical_writer'), true);
    assert.equal(canCreateFiles('product_manager'), true);
    assert.equal(canCreateFiles('ux_designer'), true);
    assert.equal(canCreateFiles('copywriter'), true);
  });

  it('returns true for full agents', () => {
    assert.equal(canCreateFiles('coder'), true);
    assert.equal(canCreateFiles('data_engineer'), true);
    assert.equal(canCreateFiles('devops_engineer'), true);
    assert.equal(canCreateFiles('tester'), true);
    assert.equal(canCreateFiles('refactor'), true);
  });

  it('returns false for read_only agents', () => {
    assert.equal(canCreateFiles('architect'), false);
    assert.equal(canCreateFiles('code_reviewer'), false);
    assert.equal(canCreateFiles('api_designer'), false);
  });

  it('returns false for read_shell agents', () => {
    assert.equal(canCreateFiles('debugger'), false);
    assert.equal(canCreateFiles('security_engineer'), false);
    assert.equal(canCreateFiles('performance_engineer'), false);
  });

  it('returns false for unknown agents', () => {
    assert.equal(canCreateFiles('nonexistent_agent'), false);
    assert.equal(canCreateFiles(''), false);
  });
});
