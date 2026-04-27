'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const claudeAdapter = require('../../src/platforms/claude/telemetry-adapter');
const codexAdapter = require('../../src/platforms/codex/telemetry-adapter');
const geminiAdapter = require('../../src/platforms/gemini/telemetry-adapter');
const qwenAdapter = require('../../src/platforms/qwen/telemetry-adapter');
const claudeConfig = require('../../src/platforms/claude/runtime-config');
const codexConfig = require('../../src/platforms/codex/runtime-config');
const geminiConfig = require('../../src/platforms/gemini/runtime-config');
const qwenConfig = require('../../src/platforms/qwen/runtime-config');
const {
  ZERO_USAGE,
} = require('../../src/platforms/shared/adapters/telemetry-adapter-types');

describe('claude telemetry adapter', () => {
  it('extracts usage from a typical Anthropic SDK response envelope', () => {
    const result = {
      usage: {
        input_tokens: 200,
        output_tokens: 100,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 20,
      },
    };
    assert.deepEqual(claudeAdapter.extractUsage(result), {
      input: 200,
      output: 100,
      cached: 50,
    });
  });

  it('treats missing cache fields as zero', () => {
    const result = { usage: { input_tokens: 50, output_tokens: 25 } };
    assert.deepEqual(claudeAdapter.extractUsage(result), {
      input: 50,
      output: 25,
      cached: 0,
    });
  });

  it('returns ZERO_USAGE when usage envelope is absent', () => {
    assert.deepEqual(claudeAdapter.extractUsage({}), ZERO_USAGE);
    assert.deepEqual(claudeAdapter.extractUsage({ usage: null }), ZERO_USAGE);
    assert.deepEqual(claudeAdapter.extractUsage(null), ZERO_USAGE);
    assert.deepEqual(claudeAdapter.extractUsage(undefined), ZERO_USAGE);
  });

  it('isAvailable is true only when usage envelope is present', () => {
    assert.equal(claudeAdapter.isAvailable({ usage: {} }), true);
    assert.equal(claudeAdapter.isAvailable({}), false);
    assert.equal(claudeAdapter.isAvailable(null), false);
  });

  it('coerces non-numeric token fields to 0', () => {
    const result = {
      usage: {
        input_tokens: 'not-a-number',
        output_tokens: NaN,
        cache_read_input_tokens: undefined,
        cache_creation_input_tokens: null,
      },
    };
    assert.deepEqual(claudeAdapter.extractUsage(result), ZERO_USAGE);
  });
});

describe('codex telemetry adapter', () => {
  it('extracts usage using OpenAI-style prompt_tokens/completion_tokens', () => {
    const result = {
      usage: { prompt_tokens: 300, completion_tokens: 150, cached_tokens: 40 },
    };
    assert.deepEqual(codexAdapter.extractUsage(result), {
      input: 300,
      output: 150,
      cached: 40,
    });
  });

  it('falls back to input_tokens/output_tokens when OpenAI keys are absent', () => {
    const result = {
      usage: { input_tokens: 100, output_tokens: 50, cached_tokens: 10 },
    };
    assert.deepEqual(codexAdapter.extractUsage(result), {
      input: 100,
      output: 50,
      cached: 10,
    });
  });

  it('returns ZERO_USAGE when usage envelope is absent', () => {
    assert.deepEqual(codexAdapter.extractUsage({}), ZERO_USAGE);
    assert.deepEqual(codexAdapter.extractUsage(null), ZERO_USAGE);
  });

  it('isAvailable is true only when usage envelope is present', () => {
    assert.equal(codexAdapter.isAvailable({ usage: {} }), true);
    assert.equal(codexAdapter.isAvailable({}), false);
  });

  it('treats missing cached_tokens as zero', () => {
    const result = { usage: { prompt_tokens: 50, completion_tokens: 25 } };
    assert.deepEqual(codexAdapter.extractUsage(result), {
      input: 50,
      output: 25,
      cached: 0,
    });
  });
});

describe('gemini telemetry adapter (stub)', () => {
  it('always returns ZERO_USAGE', () => {
    assert.deepEqual(geminiAdapter.extractUsage(null), ZERO_USAGE);
    assert.deepEqual(geminiAdapter.extractUsage({ usage: { input_tokens: 100 } }), ZERO_USAGE);
  });

  it('always reports isAvailable: false', () => {
    assert.equal(geminiAdapter.isAvailable(null), false);
    assert.equal(geminiAdapter.isAvailable({ usage: {} }), false);
  });
});

describe('qwen telemetry adapter (stub)', () => {
  it('always returns ZERO_USAGE', () => {
    assert.deepEqual(qwenAdapter.extractUsage(null), ZERO_USAGE);
    assert.deepEqual(qwenAdapter.extractUsage({ usage: { input_tokens: 100 } }), ZERO_USAGE);
  });

  it('always reports isAvailable: false', () => {
    assert.equal(qwenAdapter.isAvailable(null), false);
    assert.equal(qwenAdapter.isAvailable({ usage: {} }), false);
  });
});

describe('runtime-config telemetry export', () => {
  it('claude runtime-config exposes its telemetry adapter', () => {
    assert.equal(claudeConfig.telemetry, claudeAdapter);
    assert.equal(claudeConfig.telemetry.runtime, 'claude');
  });

  it('codex runtime-config exposes its telemetry adapter', () => {
    assert.equal(codexConfig.telemetry, codexAdapter);
    assert.equal(codexConfig.telemetry.runtime, 'codex');
  });

  it('gemini runtime-config exposes its telemetry adapter', () => {
    assert.equal(geminiConfig.telemetry, geminiAdapter);
    assert.equal(geminiConfig.telemetry.runtime, 'gemini');
  });

  it('qwen runtime-config exposes its telemetry adapter', () => {
    assert.equal(qwenConfig.telemetry, qwenAdapter);
    assert.equal(qwenConfig.telemetry.runtime, 'qwen');
  });
});
