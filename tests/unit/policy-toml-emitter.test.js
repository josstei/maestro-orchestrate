import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { buildPolicyTomlOutputs, renderPolicyToml } from '../../src/generator/policy-toml-emitter.js';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

describe('policy-toml-emitter', () => {
  it('reproduces the committed policy pack byte-for-byte', () => {
    const [out] = buildPolicyTomlOutputs();
    assert.equal(out.outputPath, 'policies/maestro.toml');
    const committed = fs.readFileSync(path.join(moduleDirname, '../../policies/maestro.toml'), 'utf8');
    assert.equal(out.content, committed);
  });

  it('throws on unsupported rule combinations', () => {
    assert.throws(() => renderPolicyToml({ denyRules: [{ matchType: 'word', pattern: 'x', reason: 'r' }], askRules: [] }));
    assert.throws(() => renderPolicyToml({ denyRules: [], askRules: [{ matchType: 'prefix', pattern: 'x', reason: 'r' }] }));
  });
});
