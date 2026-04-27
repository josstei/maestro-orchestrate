'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { handleGetAgentRecommendation, createHandler } = require('../../src/mcp/handlers/agent-recommendation');
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
      phase_deliverable: 'audit authentication for crypto vulnerability',
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
      phase_deliverable: 'audit authentication for crypto vulnerability',
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

  it('honors canonicalSrcRoot and loads agents from the provided directory', () => {
    const fakeSrcRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rec-test-'));
    const agentsDir = path.join(fakeSrcRoot, 'agents');
    fs.mkdirSync(agentsDir);
    fs.writeFileSync(
      path.join(agentsDir, 'custom-security-agent.md'),
      '---\nname: custom-security-agent\nsignals: [security, auth]\n---\nBody.\n'
    );

    const handler = createHandler(fakeSrcRoot);
    const result = handler({
      phase_deliverable: 'audit authentication for vulnerability',
    });

    assert.equal(result.agent, 'custom-security-agent');
    assert.equal(result.fell_back, false);
    assert.ok(result.score >= 2);
  });
});
