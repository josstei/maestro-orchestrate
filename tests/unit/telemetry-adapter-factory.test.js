'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TELEMETRY_USAGE_FIELDS,
  TELEMETRY_RUNTIMES,
  ZERO_USAGE,
  isTelemetryUsage,
} = require('../../src/platforms/shared/adapters/telemetry-adapter-types');
const {
  defineTelemetryAdapter,
} = require('../../src/platforms/shared/adapters/telemetry-adapter-factory');

describe('telemetry-adapter-types', () => {
  it('exposes the canonical usage field list in declaration order', () => {
    assert.deepEqual(TELEMETRY_USAGE_FIELDS, ['input', 'output', 'cached']);
  });

  it('TELEMETRY_USAGE_FIELDS is frozen', () => {
    assert.equal(Object.isFrozen(TELEMETRY_USAGE_FIELDS), true);
  });

  it('exposes the supported runtimes in declaration order', () => {
    assert.deepEqual(TELEMETRY_RUNTIMES, ['claude', 'codex', 'gemini', 'qwen']);
  });

  it('TELEMETRY_RUNTIMES is frozen', () => {
    assert.equal(Object.isFrozen(TELEMETRY_RUNTIMES), true);
  });

  it('ZERO_USAGE has all three fields set to 0 and is frozen', () => {
    assert.deepEqual(ZERO_USAGE, { input: 0, output: 0, cached: 0 });
    assert.equal(Object.isFrozen(ZERO_USAGE), true);
  });

  describe('isTelemetryUsage', () => {
    it('accepts a fully-populated usage object', () => {
      assert.equal(isTelemetryUsage({ input: 100, output: 50, cached: 10 }), true);
    });

    it('accepts an all-zeros usage object', () => {
      assert.equal(isTelemetryUsage(ZERO_USAGE), true);
    });

    it('rejects null', () => {
      assert.equal(isTelemetryUsage(null), false);
    });

    it('rejects undefined', () => {
      assert.equal(isTelemetryUsage(undefined), false);
    });

    it('rejects a primitive', () => {
      assert.equal(isTelemetryUsage(100), false);
      assert.equal(isTelemetryUsage('100'), false);
    });

    it('rejects an array', () => {
      assert.equal(isTelemetryUsage([1, 2, 3]), false);
    });

    it('rejects an object missing a required field', () => {
      assert.equal(isTelemetryUsage({ input: 1, output: 2 }), false);
    });

    it('rejects an object with a non-numeric field', () => {
      assert.equal(isTelemetryUsage({ input: '1', output: 2, cached: 0 }), false);
    });
  });
});

describe('defineTelemetryAdapter', () => {
  it('returns an adapter exposing runtime, extractUsage, isAvailable', () => {
    const adapter = defineTelemetryAdapter({
      runtime: 'claude',
      extractUsage: () => ({ input: 1, output: 2, cached: 3 }),
      isAvailable: () => true,
    });
    assert.equal(adapter.runtime, 'claude');
    assert.equal(typeof adapter.extractUsage, 'function');
    assert.equal(typeof adapter.isAvailable, 'function');
  });

  it('throws when spec is missing', () => {
    assert.throws(() => defineTelemetryAdapter(), TypeError);
    assert.throws(() => defineTelemetryAdapter(null), TypeError);
  });

  it('throws when runtime is not in TELEMETRY_RUNTIMES', () => {
    assert.throws(
      () =>
        defineTelemetryAdapter({
          runtime: 'openai',
          extractUsage: () => ZERO_USAGE,
          isAvailable: () => false,
        }),
      /runtime must be one of/
    );
  });

  it('throws when extractUsage is not a function', () => {
    assert.throws(
      () =>
        defineTelemetryAdapter({
          runtime: 'claude',
          extractUsage: 'not-a-function',
          isAvailable: () => true,
        }),
      /extractUsage must be a function/
    );
  });

  it('throws when isAvailable is not a function', () => {
    assert.throws(
      () =>
        defineTelemetryAdapter({
          runtime: 'claude',
          extractUsage: () => ZERO_USAGE,
          isAvailable: 'not-a-function',
        }),
      /isAvailable must be a function/
    );
  });

  it('extractUsage returns ZERO_USAGE when underlying spec returns malformed shape', () => {
    const adapter = defineTelemetryAdapter({
      runtime: 'claude',
      extractUsage: () => ({ input: 100 }),
      isAvailable: () => true,
    });
    assert.deepEqual(adapter.extractUsage({}), ZERO_USAGE);
  });

  it('extractUsage returns ZERO_USAGE when underlying spec returns null', () => {
    const adapter = defineTelemetryAdapter({
      runtime: 'codex',
      extractUsage: () => null,
      isAvailable: () => false,
    });
    assert.deepEqual(adapter.extractUsage({}), ZERO_USAGE);
  });

  it('extractUsage passes through a well-formed usage object', () => {
    const adapter = defineTelemetryAdapter({
      runtime: 'claude',
      extractUsage: () => ({ input: 100, output: 50, cached: 10 }),
      isAvailable: () => true,
    });
    assert.deepEqual(adapter.extractUsage({}), { input: 100, output: 50, cached: 10 });
  });

  it('isAvailable returns false when underlying spec throws', () => {
    const adapter = defineTelemetryAdapter({
      runtime: 'claude',
      extractUsage: () => ZERO_USAGE,
      isAvailable: () => {
        throw new Error('no usage source');
      },
    });
    assert.equal(adapter.isAvailable({}), false);
  });

  it('isAvailable coerces truthy/falsy results to boolean', () => {
    const truthyAdapter = defineTelemetryAdapter({
      runtime: 'claude',
      extractUsage: () => ZERO_USAGE,
      isAvailable: () => 'yes',
    });
    assert.equal(truthyAdapter.isAvailable({}), true);

    const falsyAdapter = defineTelemetryAdapter({
      runtime: 'gemini',
      extractUsage: () => ZERO_USAGE,
      isAvailable: () => null,
    });
    assert.equal(falsyAdapter.isAvailable({}), false);
  });
});
