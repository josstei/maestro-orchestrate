'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildHookConfigOutputs } = require('../../src/generator/hook-config-emitter');

describe('claude PreToolUse matchers', () => {
  it('registers the policy enforcer for write tools', () => {
    const outputs = buildHookConfigOutputs({ gemini: null, qwen: null });
    const claude = outputs.find((o) => o.outputPath.includes('claude-hooks.json'));
    const cfg = JSON.parse(claude.content);
    const matchers = cfg.hooks.PreToolUse.map((e) => e.matcher);
    assert.ok(matchers.includes('Bash'));
    assert.ok(matchers.includes('Write|Edit|MultiEdit'));
  });
});
