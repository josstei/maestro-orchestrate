import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPolicyToml } from '../../dist/src/generator/policy-toml-emitter.js';

describe('toml emitter', () => {
  it('excludes non-command-tier rules', () => {
    const toml = renderPolicyToml({
      denyRules: [
        { matchType: 'prefix', pattern: 'rm -rf', tier: 'command', reason: 'x' },
        { matchType: 'regex', pattern: 'SHOULD_NOT_APPEAR', tier: 'write', reason: 'y' },
      ],
      askRules: [],
    });
    assert.ok(toml.includes('rm -rf'));
    assert.ok(!toml.includes('SHOULD_NOT_APPEAR'));
  });
  it('emits the expanded corpus deny patterns', () => {
    const toml = renderPolicyToml();
    assert.ok(toml.includes('mkfs'));
    assert.ok(toml.includes('shred'));
  });
});
