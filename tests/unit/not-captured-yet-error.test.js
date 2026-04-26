'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { NotCapturedYetError } = require('../../src/platforms/shared/contract-probes/not-captured-yet-error');

describe('NotCapturedYetError', () => {
  it('is an Error subclass', () => {
    const e = new NotCapturedYetError('claude');
    assert.ok(e instanceof Error);
  });

  it('attaches code CONTRACT_FIXTURE_MISSING', () => {
    const e = new NotCapturedYetError('codex');
    assert.equal(e.code, 'CONTRACT_FIXTURE_MISSING');
  });

  it('attaches the runtime name', () => {
    const e = new NotCapturedYetError('qwen');
    assert.equal(e.runtime, 'qwen');
  });

  it('produces a message that names the runtime and points to the README', () => {
    const e = new NotCapturedYetError('gemini');
    assert.match(e.message, /'gemini' not yet captured/);
    assert.match(e.message, /tests\/fixtures\/runtime-contracts\/gemini\/README\.md/);
  });
});
