import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DENY_RULES, KNOWN_UNENFORCED_RUNTIMES } from '../../dist/src/core/policy-rules.js';
import { renderPolicyToml } from '../../dist/src/generator/policy-toml-emitter.js';
import { toHookOutput, checkCommand } from '../../dist/src/hooks/policy/policy-enforcer.js';

describe('policy conformance', () => {
  it('every command-tier deny pattern is represented in the Gemini/Qwen TOML', () => {
    const toml = renderPolicyToml();
    for (const r of DENY_RULES.filter((x) => (x.tier || 'command') === 'command')) {
      const esc = r.pattern.replace(/\\/g, '\\\\');
      assert.ok(toml.includes(esc), `TOML missing ${r.pattern}`);
    }
  });
  it('codex is the only declared-unenforced runtime', () => {
    assert.deepEqual([...KNOWN_UNENFORCED_RUNTIMES], ['codex']);
  });
  it('every decision emits schema-valid hook output', () => {
    for (const d of ['approve', 'ask', 'block']) {
      const out = toHookOutput({ decision: d, reason: 'r' });
      assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
      assert.ok(['allow', 'ask', 'deny'].includes(out.hookSpecificOutput.permissionDecision));
    }
    // and a real block path produces valid output end-to-end
    const out = toHookOutput(checkCommand('rm -rf /'));
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  });
});
