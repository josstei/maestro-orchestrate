import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { buildPolicyTomlOutputs, renderPolicyToml } from '../../dist/src/generator/policy-toml-emitter.js';
import { repoPath } from '../support/paths.js';

describe('policy-toml-emitter', () => {
  it('reproduces the committed policy pack byte-for-byte', () => {
    const [out] = buildPolicyTomlOutputs();
    assert.equal(out.outputPath, 'policies/maestro.toml');
    const committed = fs.readFileSync(repoPath('policies/maestro.toml'), 'utf8');
    assert.equal(out.content, committed);
  });

  it('throws on unsupported rule combinations', () => {
    assert.throws(() => renderPolicyToml({ denyRules: [{ matchType: 'word', pattern: 'x', reason: 'r' }], askRules: [] }));
    assert.throws(() => renderPolicyToml({ denyRules: [], askRules: [{ matchType: 'prefix', pattern: 'x', reason: 'r' }] }));
  });
});
