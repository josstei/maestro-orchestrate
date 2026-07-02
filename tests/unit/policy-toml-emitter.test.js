'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildPolicyTomlOutputs } = require('../../src/generator/policy-toml-emitter');

describe('policy-toml-emitter', () => {
  it('reproduces the committed policy pack byte-for-byte', () => {
    const [out] = buildPolicyTomlOutputs();
    assert.equal(out.outputPath, 'policies/maestro.toml');
    const committed = fs.readFileSync(path.join(__dirname, '../../policies/maestro.toml'), 'utf8');
    assert.equal(out.content, committed);
  });

  it('throws on unsupported rule combinations', () => {
    const { renderPolicyToml } = require('../../src/generator/policy-toml-emitter');
    assert.throws(() => renderPolicyToml({ denyRules: [{ matchType: 'word', pattern: 'x', reason: 'r' }], askRules: [] }));
    assert.throws(() => renderPolicyToml({ denyRules: [], askRules: [{ matchType: 'prefix', pattern: 'x', reason: 'r' }] }));
  });
});
