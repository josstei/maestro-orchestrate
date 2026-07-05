import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASK_RUNG_KINDS,
  getAskCapabilityLadder,
  isAdditiveLadderExtension,
} from '../../src/mcp/contracts/ask-capability.js';

describe('AskCapability ladder contract', () => {
  it('gives Claude a single native-ask rung', () => {
    assert.deepEqual(getAskCapabilityLadder('claude'), [ASK_RUNG_KINDS.NATIVE_ASK_TOOL]);
  });

  it('gives Gemini a native-ask rung followed by an informed-text fallback', () => {
    assert.deepEqual(getAskCapabilityLadder('gemini'), [
      ASK_RUNG_KINDS.NATIVE_ASK_TOOL,
      ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK,
    ]);
  });

  it('gives Qwen the same ladder shape as Gemini (Gemini-family fork)', () => {
    assert.deepEqual(getAskCapabilityLadder('qwen'), getAskCapabilityLadder('gemini'));
  });

  it('gives Codex a plan-mode-request -> nudge -> informed-text ladder', () => {
    assert.deepEqual(getAskCapabilityLadder('codex'), [
      ASK_RUNG_KINDS.PLAN_MODE_REQUEST,
      ASK_RUNG_KINDS.USER_ACTION_NUDGE,
      ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK,
    ]);
  });

  it('throws for an unregistered runtime name', () => {
    assert.throws(() => getAskCapabilityLadder('unknown-runtime'), /AskCapability ladder/);
  });

  it('returns ladders that cannot be mutated by callers', () => {
    const ladder = getAskCapabilityLadder('codex');
    assert.throws(() => {
      ladder.push(ASK_RUNG_KINDS.NATIVE_ASK_TOOL);
    }, TypeError);
  });

  it('treats appending new rungs to the end as an additive extension', () => {
    const previous = [ASK_RUNG_KINDS.NATIVE_ASK_TOOL];
    const next = [ASK_RUNG_KINDS.NATIVE_ASK_TOOL, ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK];
    assert.equal(isAdditiveLadderExtension(previous, next), true);
  });

  it('rejects a change that alters an existing rung value', () => {
    const previous = [ASK_RUNG_KINDS.NATIVE_ASK_TOOL, ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK];
    const next = [ASK_RUNG_KINDS.PLAN_MODE_REQUEST, ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK];
    assert.equal(isAdditiveLadderExtension(previous, next), false);
  });

  it('rejects a change that removes an existing rung', () => {
    const previous = [ASK_RUNG_KINDS.NATIVE_ASK_TOOL, ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK];
    const next = [ASK_RUNG_KINDS.NATIVE_ASK_TOOL];
    assert.equal(isAdditiveLadderExtension(previous, next), false);
  });
});
