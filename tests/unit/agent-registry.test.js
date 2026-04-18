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

const VALID_CAPABILITY_LEVELS = ['read_only', 'read_shell', 'read_write', 'full'];

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

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
    const result = withEnv({ MAESTRO_CURRENT_AGENT: null }, () =>
      detectAgentFromPrompt('agent: coder\n\nDo some work.')
    );
    assert.equal(result, 'coder');
  });

  it('finds agent from "agent: code-reviewer" header and normalizes to snake_case', () => {
    const result = withEnv({ MAESTRO_CURRENT_AGENT: null }, () =>
      detectAgentFromPrompt('agent: code-reviewer\n\nReview this PR.')
    );
    assert.equal(result, 'code_reviewer');
  });

  it('matches @code_reviewer mention', () => {
    const result = withEnv({ MAESTRO_CURRENT_AGENT: null }, () =>
      detectAgentFromPrompt('Please ask @code_reviewer to check this.')
    );
    assert.equal(result, 'code_reviewer');
  });

  it('matches "delegate to coder" pattern', () => {
    const result = withEnv({ MAESTRO_CURRENT_AGENT: null }, () =>
      detectAgentFromPrompt('delegate to coder for implementation')
    );
    assert.equal(result, 'coder');
  });

  it('matches "hand off to debugger" pattern', () => {
    const result = withEnv({ MAESTRO_CURRENT_AGENT: null }, () =>
      detectAgentFromPrompt('hand off to debugger for investigation')
    );
    assert.equal(result, 'debugger');
  });

  it('returns empty string for empty prompt, null prompt, and prompts with no agent', () => {
    withEnv({ MAESTRO_CURRENT_AGENT: null }, () => {
      assert.equal(detectAgentFromPrompt(''), '');
      assert.equal(detectAgentFromPrompt(null), '');
      assert.equal(detectAgentFromPrompt('Just a normal message with no agent.'), '');
    });
  });

  it('falls back to MAESTRO_CURRENT_AGENT env when no header is present', () => {
    const result = withEnv({ MAESTRO_CURRENT_AGENT: 'tester' }, () =>
      detectAgentFromPrompt('Run all tests please.')
    );
    assert.equal(result, 'tester');
  });

  it('prefers header agent over MAESTRO_CURRENT_AGENT env', () => {
    const result = withEnv({ MAESTRO_CURRENT_AGENT: 'tester' }, () =>
      detectAgentFromPrompt('agent: coder\n\nImplement the feature.')
    );
    assert.equal(result, 'coder');
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
