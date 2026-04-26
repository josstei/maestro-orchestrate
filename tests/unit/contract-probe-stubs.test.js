'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const claude = require('../../src/platforms/claude/contract-probe');
const codex = require('../../src/platforms/codex/contract-probe');
const qwen = require('../../src/platforms/qwen/contract-probe');

describe('Claude contract probe (stub)', () => {
  it('throws NotCapturedYetError for stub fixtures', () => {
    assert.throws(() => claude.probeClaudeContract({ stub: true }), {
      message: /not yet captured/i,
    });
  });

  it('throws when called with a non-stub payload (real fixture not yet captured)', () => {
    assert.throws(() => claude.probeClaudeContract({ tools: [] }), /follow-up PR/);
  });
});

describe('Codex contract probe (stub)', () => {
  it('throws NotCapturedYetError for stub fixtures', () => {
    assert.throws(() => codex.probeCodexContract({ stub: true }), {
      message: /not yet captured/i,
    });
  });
});

describe('Qwen contract probe (stub)', () => {
  it('throws NotCapturedYetError for stub fixtures', () => {
    assert.throws(() => qwen.probeQwenContract({ stub: true }), {
      message: /not yet captured/i,
    });
  });
});
