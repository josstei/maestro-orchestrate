'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const constants = require('../../src/lib/constants');

describe('constants', () => {
  it('exports KNOWN_AGENTS as a frozen array of 12 agents', () => {
    assert.ok(Array.isArray(constants.KNOWN_AGENTS));
    assert.equal(constants.KNOWN_AGENTS.length, 12);
    assert.ok(Object.isFrozen(constants.KNOWN_AGENTS));
    assert.ok(constants.KNOWN_AGENTS.includes('coder'));
    assert.ok(constants.KNOWN_AGENTS.includes('architect'));
    assert.ok(constants.KNOWN_AGENTS.includes('tester'));
  });

  it('exports DEFAULT_STATE_DIR as .gemini', () => {
    assert.equal(constants.DEFAULT_STATE_DIR, '.gemini');
  });

  it('exports numeric defaults', () => {
    assert.equal(constants.DEFAULT_TIMEOUT_MINS, 10);
    assert.equal(constants.DEFAULT_STAGGER_DELAY, 5);
    assert.equal(constants.HOOK_STATE_TTL_MS, 7200000);
    assert.equal(constants.MAX_PROMPT_SIZE_BYTES, 1000000);
  });
});
