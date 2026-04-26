'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isRuntimeContract,
  CONTRACT_REQUIRED_FIELDS,
} = require('../../src/platforms/shared/contract-probes/types');

describe('CONTRACT_REQUIRED_FIELDS', () => {
  it('lists the four canonical fields', () => {
    assert.deepEqual(CONTRACT_REQUIRED_FIELDS, [
      'registered_tools',
      'subagent_registry_fields',
      'delegation_surface',
      'frontmatter_enforcement',
    ]);
  });
});

describe('isRuntimeContract', () => {
  it('returns true for a complete contract', () => {
    const contract = {
      registered_tools: ['read_file', 'write_file'],
      subagent_registry_fields: ['name', 'description'],
      delegation_surface: { tool: 'invoke_agent', params: ['agent_name', 'prompt'] },
      frontmatter_enforcement: 'unverified',
    };
    assert.equal(isRuntimeContract(contract), true);
  });

  it('returns false when a required field is missing', () => {
    const incomplete = {
      registered_tools: ['read_file'],
      subagent_registry_fields: ['name'],
    };
    assert.equal(isRuntimeContract(incomplete), false);
  });

  it('returns false for non-objects', () => {
    assert.equal(isRuntimeContract(null), false);
    assert.equal(isRuntimeContract('contract'), false);
    assert.equal(isRuntimeContract(undefined), false);
  });
});
