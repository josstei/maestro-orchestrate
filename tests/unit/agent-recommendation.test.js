'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleGetAgentRecommendation } = require('../../src/mcp/handlers/agent-recommendation');
const { ValidationError } = require('../../src/lib/errors');

describe('handleGetAgentRecommendation', () => {
  it('throws ValidationError when phase_deliverable is missing', () => {
    assert.throws(
      () => handleGetAgentRecommendation({}),
      (err) => err instanceof ValidationError && err.code === 'VALIDATION_ERROR'
    );
  });

  it('throws ValidationError when phase_deliverable is an empty string', () => {
    assert.throws(
      () => handleGetAgentRecommendation({ phase_deliverable: '' }),
      (err) => err instanceof ValidationError && err.code === 'VALIDATION_ERROR'
    );
  });

  it('throws ValidationError when phase_deliverable is a number', () => {
    assert.throws(
      () => handleGetAgentRecommendation({ phase_deliverable: 42 }),
      (err) => err instanceof ValidationError && err.code === 'VALIDATION_ERROR'
    );
  });

  it('throws ValidationError when phase_deliverable is null', () => {
    assert.throws(
      () => handleGetAgentRecommendation({ phase_deliverable: null }),
      (err) => err instanceof ValidationError && err.code === 'VALIDATION_ERROR'
    );
  });

  it('returns security-engineer for a security audit deliverable', () => {
    const result = handleGetAgentRecommendation({
      phase_deliverable: 'audit the login flow for security and authorization vulnerabilities',
    });
    assert.equal(result.agent, 'security-engineer');
    assert.equal(result.fell_back, false);
  });

  it('falls back to coder for a deliverable with no matching keywords', () => {
    const result = handleGetAgentRecommendation({
      phase_deliverable: 'general housekeeping',
    });
    assert.equal(result.agent, 'coder');
    assert.equal(result.fell_back, true);
  });

  it('returns the expected shape on every successful call', () => {
    const result = handleGetAgentRecommendation({
      phase_deliverable: 'audit the login flow for security and authorization vulnerabilities',
    });
    assert.ok('agent' in result, 'result must have agent');
    assert.ok('score' in result, 'result must have score');
    assert.ok('matched_signals' in result, 'result must have matched_signals');
    assert.ok('fell_back' in result, 'result must have fell_back');
    assert.equal(typeof result.agent, 'string');
    assert.equal(typeof result.score, 'number');
    assert.ok(Array.isArray(result.matched_signals));
    assert.equal(typeof result.fell_back, 'boolean');
  });
});
