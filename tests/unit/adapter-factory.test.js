'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { defineAdapter } = require('../../src/platforms/shared/adapters/factory');
const { readBoundedJson } = require('../../src/core/stdin-reader');
const { EXIT_SUCCESS } = require('../../src/platforms/shared/adapters/exit-codes');

const minimalSpec = () => ({
  normalizeInput: (raw) => raw,
  formatOutput: (result) => result,
  errorFallback: () => ({ fallback: true }),
});

describe('defineAdapter', () => {
  it('returns an adapter with the caller-provided hooks', () => {
    const spec = minimalSpec();
    const adapter = defineAdapter(spec);
    assert.equal(adapter.normalizeInput, spec.normalizeInput);
    assert.equal(adapter.formatOutput, spec.formatOutput);
    assert.equal(adapter.errorFallback, spec.errorFallback);
  });

  it('defaults readBoundedStdin to the shared readBoundedJson', () => {
    const adapter = defineAdapter(minimalSpec());
    assert.equal(adapter.readBoundedStdin, readBoundedJson);
  });

  it('defaults getExitCode to a function that returns EXIT_SUCCESS', () => {
    const adapter = defineAdapter(minimalSpec());
    assert.equal(typeof adapter.getExitCode, 'function');
    assert.equal(adapter.getExitCode({ anything: true }), EXIT_SUCCESS);
  });

  it('preserves a caller-provided readBoundedStdin override', () => {
    const customReader = async () => ({ source: 'custom' });
    const adapter = defineAdapter({ ...minimalSpec(), readBoundedStdin: customReader });
    assert.equal(adapter.readBoundedStdin, customReader);
  });

  it('preserves a caller-provided getExitCode override', () => {
    const customExit = (result) => (result.fail ? 2 : 0);
    const adapter = defineAdapter({ ...minimalSpec(), getExitCode: customExit });
    assert.equal(adapter.getExitCode({ fail: true }), 2);
    assert.equal(adapter.getExitCode({ fail: false }), 0);
  });

  it('throws when spec is null', () => {
    assert.throws(() => defineAdapter(null), /must provide normalizeInput/);
  });

  it('throws when spec is undefined', () => {
    assert.throws(() => defineAdapter(undefined), /must provide normalizeInput/);
  });

  it('throws when normalizeInput is missing or not a function', () => {
    assert.throws(
      () => defineAdapter({ formatOutput: () => {}, errorFallback: () => ({}) }),
      /must provide normalizeInput/
    );
    assert.throws(
      () =>
        defineAdapter({
          normalizeInput: 'not a fn',
          formatOutput: () => {},
          errorFallback: () => ({}),
        }),
      /must provide normalizeInput/
    );
  });

  it('throws when formatOutput is missing or not a function', () => {
    assert.throws(
      () => defineAdapter({ normalizeInput: () => {}, errorFallback: () => ({}) }),
      /must provide formatOutput/
    );
    assert.throws(
      () =>
        defineAdapter({
          normalizeInput: () => {},
          formatOutput: 42,
          errorFallback: () => ({}),
        }),
      /must provide formatOutput/
    );
  });

  it('throws when errorFallback is missing or not a function', () => {
    assert.throws(
      () => defineAdapter({ normalizeInput: () => {}, formatOutput: () => {} }),
      /must provide errorFallback/
    );
    assert.throws(
      () =>
        defineAdapter({
          normalizeInput: () => {},
          formatOutput: () => {},
          errorFallback: {},
        }),
      /must provide errorFallback/
    );
  });
});
