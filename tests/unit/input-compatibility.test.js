import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGetAgentInput,
  normalizePlanPhaseAgentInput,
} from '../../dist/src/mcp/contracts/input-compatibility.js';
import { ValidationError } from '../../dist/src/lib/errors/index.js';

describe('normalizeGetAgentInput', () => {
  it('normalizes canonical agents array', () => {
    const input = { agents: ['coder', 'code_reviewer'] };
    const result = normalizeGetAgentInput(input);
    assert.deepEqual(result, { agents: ['coder', 'code_reviewer'] });
  });

  it('normalizes scalar agents string', () => {
    const input = { agents: 'coder' };
    const result = normalizeGetAgentInput(input);
    assert.deepEqual(result, { agents: ['coder'] });
  });

  it('normalizes singular agent compatibility alias', () => {
    const input = { agent: 'coder' };
    const result = normalizeGetAgentInput(input);
    assert.deepEqual(result, { agents: ['coder'] });
  });

  it('trims agent whitespace', () => {
    const input = { agents: ['  coder  ', ' code_reviewer '] };
    const result = normalizeGetAgentInput(input);
    assert.deepEqual(result, { agents: ['coder', 'code_reviewer'] });
  });

  it('does not mutate input object', () => {
    const input = Object.freeze({ agents: ['coder'] });
    const result = normalizeGetAgentInput(input);
    assert.deepEqual(result, { agents: ['coder'] });
  });

  it('rejects missing fields with MISSING_AGENT_INPUT', () => {
    assert.throws(
      () => normalizeGetAgentInput({}),
      (err) => err instanceof ValidationError && err.code === 'MISSING_AGENT_INPUT'
    );
    assert.throws(
      () => normalizeGetAgentInput(null),
      (err) => err instanceof ValidationError && err.code === 'MISSING_AGENT_INPUT'
    );
  });

  it('rejects ambiguous payloads containing both agent and agents with AMBIGUOUS_AGENT_INPUT', () => {
    assert.throws(
      () => normalizeGetAgentInput({ agent: 'coder', agents: ['coder'] }),
      (err) => err instanceof ValidationError && err.code === 'AMBIGUOUS_AGENT_INPUT'
    );
  });

  it('rejects empty array with INVALID_AGENT_INPUT', () => {
    assert.throws(
      () => normalizeGetAgentInput({ agents: [] }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_INPUT'
    );
  });

  it('rejects empty or whitespace string with INVALID_AGENT_INPUT', () => {
    assert.throws(
      () => normalizeGetAgentInput({ agents: '' }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_INPUT'
    );
    assert.throws(
      () => normalizeGetAgentInput({ agent: '   ' }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_INPUT'
    );
    assert.throws(
      () => normalizeGetAgentInput({ agents: ['coder', '  '] }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_INPUT'
    );
  });

  it('rejects non-string array entries with INVALID_AGENT_INPUT', () => {
    assert.throws(
      () => normalizeGetAgentInput({ agents: [123] }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_INPUT'
    );
  });
});

describe('normalizePlanPhaseAgentInput', () => {
  it('normalizes canonical singular agent phase', () => {
    const phase = { id: 1, name: 'Build', agent: 'coder', parallel: false, blocked_by: [] };
    const result = normalizePlanPhaseAgentInput(phase);
    assert.deepEqual(result, { id: 1, name: 'Build', agent: 'coder', parallel: false, blocked_by: [] });
  });

  it('normalizes single-entry agents compatibility array', () => {
    const phase = { id: 1, name: 'Build', agents: ['coder'], parallel: false, blocked_by: [] };
    const result = normalizePlanPhaseAgentInput(phase);
    assert.deepEqual(result, { id: 1, name: 'Build', agent: 'coder', parallel: false, blocked_by: [] });
  });

  it('does not mutate original phase object', () => {
    const phase = Object.freeze({ id: 1, name: 'Build', agents: ['coder'], parallel: false, blocked_by: [] });
    const result = normalizePlanPhaseAgentInput(phase);
    assert.deepEqual(result, { id: 1, name: 'Build', agent: 'coder', parallel: false, blocked_by: [] });
    assert.equal('agents' in result, false);
  });

  it('rejects missing agent fields with MISSING_AGENT_INPUT', () => {
    assert.throws(
      () => normalizePlanPhaseAgentInput({ id: 1, name: 'Build' }),
      (err) => err instanceof ValidationError && err.code === 'MISSING_AGENT_INPUT'
    );
  });

  it('rejects ambiguous phase with both agent and agents with AMBIGUOUS_AGENT_INPUT', () => {
    assert.throws(
      () => normalizePlanPhaseAgentInput({ id: 1, name: 'Build', agent: 'coder', agents: ['coder'] }),
      (err) => err instanceof ValidationError && err.code === 'AMBIGUOUS_AGENT_INPUT'
    );
  });

  it('rejects empty agents array with INVALID_AGENT_CARDINALITY', () => {
    assert.throws(
      () => normalizePlanPhaseAgentInput({ id: 1, name: 'Build', agents: [] }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_CARDINALITY'
    );
  });

  it('rejects multi-entry agents array with INVALID_AGENT_CARDINALITY', () => {
    assert.throws(
      () => normalizePlanPhaseAgentInput({ id: 1, name: 'Build', agents: ['coder', 'tester'] }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_CARDINALITY'
    );
  });

  it('rejects array assigned to singular agent with INVALID_AGENT_INPUT', () => {
    assert.throws(
      () => normalizePlanPhaseAgentInput({ id: 1, name: 'Build', agent: ['coder'] }),
      (err) => err instanceof ValidationError && err.code === 'INVALID_AGENT_INPUT'
    );
  });
});
