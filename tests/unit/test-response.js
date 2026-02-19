'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const response = require('../../src/lib/response');

describe('response', () => {
  it('allow() returns decision:allow JSON', () => {
    assert.equal(response.allow(), '{"decision":"allow"}');
  });

  it('deny(reason) returns decision:deny with reason', () => {
    const result = JSON.parse(response.deny('bad format'));
    assert.equal(result.decision, 'deny');
    assert.equal(result.reason, 'bad format');
  });

  it('allowWithContext() returns allow with hookSpecificOutput', () => {
    const result = JSON.parse(response.allowWithContext('phase=2', 'BeforeAgent'));
    assert.equal(result.decision, 'allow');
    assert.equal(result.hookSpecificOutput.hookEventName, 'BeforeAgent');
    assert.equal(result.hookSpecificOutput.additionalContext, 'phase=2');
  });

  it('allowWithContext() defaults hookEventName to BeforeAgent', () => {
    const result = JSON.parse(response.allowWithContext('ctx'));
    assert.equal(result.hookSpecificOutput.hookEventName, 'BeforeAgent');
  });

  it('advisory() returns empty object JSON', () => {
    assert.equal(response.advisory(), '{}');
  });
});
