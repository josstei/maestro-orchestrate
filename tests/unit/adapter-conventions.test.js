'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  ADAPTER_SUFFIX,
  isAdapterFile,
  extractRuntime,
} = require('../../src/platforms/shared/adapters/conventions');

describe('ADAPTER_SUFFIX', () => {
  it('is the string "-adapter.js"', () => {
    assert.equal(ADAPTER_SUFFIX, '-adapter.js');
  });
});

describe('isAdapterFile', () => {
  it('returns true for valid adapter filenames', () => {
    assert.ok(isAdapterFile('claude-adapter.js'));
    assert.ok(isAdapterFile('gemini-adapter.js'));
    assert.ok(isAdapterFile('qwen-adapter.js'));
  });

  it('returns false for non-adapter filenames', () => {
    assert.ok(!isAdapterFile('exit-codes.js'));
    assert.ok(!isAdapterFile('conventions.js'));
    assert.ok(!isAdapterFile('hook-runner.js'));
    assert.ok(!isAdapterFile('adapter.js'));
  });

  it('returns false for paths containing directory separators', () => {
    assert.ok(!isAdapterFile('adapters/claude-adapter.js'));
    assert.ok(!isAdapterFile('shared/gemini-adapter.js'));
  });
});

describe('extractRuntime', () => {
  it('extracts runtime name from valid adapter filenames', () => {
    assert.equal(extractRuntime('claude-adapter.js'), 'claude');
    assert.equal(extractRuntime('gemini-adapter.js'), 'gemini');
    assert.equal(extractRuntime('qwen-adapter.js'), 'qwen');
    assert.equal(extractRuntime('my-new-runtime-adapter.js'), 'my-new-runtime');
  });

  it('returns null for non-adapter filenames', () => {
    assert.equal(extractRuntime('exit-codes.js'), null);
    assert.equal(extractRuntime('conventions.js'), null);
    assert.equal(extractRuntime('hook-runner.js'), null);
  });
});
