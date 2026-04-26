'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  verifyConfigAgainstContract,
  ConfigContractMismatchError,
} = require('../../src/platforms/shared/contract-probes/verify-config');

const okContract = Object.freeze({
  registered_tools: ['invoke_agent', 'read_file'],
  subagent_registry_fields: ['name', 'description'],
  delegation_surface: { tool: 'invoke_agent', params: ['agent_name', 'prompt'] },
  frontmatter_enforcement: 'unverified',
});

describe('verifyConfigAgainstContract', () => {
  it('passes for a config whose delegation tool is registered', () => {
    const config = { delegation: { pattern: 'invoke_agent({...})' } };
    assert.doesNotThrow(() => verifyConfigAgainstContract(config, okContract));
  });

  it('REJECTS unresolved {{agent}} template (rev-1-broken case)', () => {
    const config = { delegation: { pattern: '{{agent}}(query: "...")' } };
    assert.throws(
      () => verifyConfigAgainstContract(config, okContract),
      ConfigContractMismatchError
    );
    try {
      verifyConfigAgainstContract(config, okContract);
    } catch (e) {
      assert.match(e.message, /unresolved template/i);
      assert.equal(e.details.declared_tool, '{{agent}}');
    }
  });

  it('REJECTS unresolved template with whitespace inside braces', () => {
    const config = { delegation: { pattern: '{{ agent }}(...)' } };
    assert.throws(
      () => verifyConfigAgainstContract(config, okContract),
      /unresolved template/i
    );
  });

  it('REJECTS unresolved template with dotted name', () => {
    const config = { delegation: { pattern: '{{agent.name}}(...)' } };
    assert.throws(
      () => verifyConfigAgainstContract(config, okContract),
      /unresolved template/i
    );
  });

  it('rejects when declared tool is not in registered_tools', () => {
    const config = { delegation: { pattern: 'coder(query: "...")' } };
    assert.throws(
      () => verifyConfigAgainstContract(config, okContract),
      /not in the runtime's registered_tools/
    );
  });

  it('rejects when delegation.pattern is malformed', () => {
    const config = { delegation: { pattern: '!!! garbage' } };
    assert.throws(
      () => verifyConfigAgainstContract(config, okContract),
      /malformed/i
    );
  });

  it('rejects shell-style ${agent} template as malformed', () => {
    const config = { delegation: { pattern: '${agent}(query: "...")' } };
    assert.throws(
      () => verifyConfigAgainstContract(config, okContract),
      /malformed/i
    );
  });

  it('rejects when frontmatter enforcement required but contract is unverified', () => {
    const config = {
      delegation: {
        pattern: 'invoke_agent({...})',
        requires_frontmatter_enforcement: true,
      },
    };
    assert.throws(
      () => verifyConfigAgainstContract(config, okContract),
      /frontmatter enforcement/i
    );
  });

  it('passes when frontmatter enforcement required AND contract is enforced', () => {
    const enforcedContract = { ...okContract, frontmatter_enforcement: 'enforced' };
    const config = {
      delegation: {
        pattern: 'invoke_agent({...})',
        requires_frontmatter_enforcement: true,
      },
    };
    assert.doesNotThrow(() => verifyConfigAgainstContract(config, enforcedContract));
  });

  it('treats a missing delegation block as malformed', () => {
    const config = {};
    assert.throws(() => verifyConfigAgainstContract(config, okContract), /malformed/i);
  });
});

describe('ConfigContractMismatchError', () => {
  it('carries code CONFIG_CONTRACT_MISMATCH', () => {
    const e = new ConfigContractMismatchError('test', { foo: 1 });
    assert.equal(e.code, 'CONFIG_CONTRACT_MISMATCH');
    assert.deepEqual(e.details, { foo: 1 });
  });

  it('is an Error subclass', () => {
    const e = new ConfigContractMismatchError('test');
    assert.ok(e instanceof Error);
  });
});
