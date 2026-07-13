import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, transforms } from '../../dist/src/transforms/index.js';
import agentStub from '../../dist/src/transforms/agent-stub.js';
import extractExamples from '../../dist/src/transforms/extract-examples.js';
import parseFrontmatter from '../../dist/src/transforms/parse-frontmatter.js';
import rebuildFrontmatter from '../../dist/src/transforms/rebuild-frontmatter.js';
import skillDiscoveryStub from '../../dist/src/transforms/skill-discovery-stub.js';
import skillMetadata from '../../dist/src/transforms/skill-metadata.js';

const registered = {
  'agent-stub': agentStub,
  'extract-examples': extractExamples,
  'parse-frontmatter': parseFrontmatter,
  'rebuild-frontmatter': rebuildFrontmatter,
  'skill-discovery-stub': skillDiscoveryStub,
  'skill-metadata': skillMetadata,
};
const assertUnknown = (name) =>
  assert.throws(() => resolve(name), new Error(`Unknown transform: "${name.split(':')[0]}"`));

describe('transforms/index resolve', () => {
  it('exposes the exact eager registry', () => {
    assert.equal(Object.getPrototypeOf(transforms), null);
    assert.deepEqual(Object.keys(transforms), Object.keys(registered));
  });

  it('preserves function identities', () => {
    for (const [name, fn] of Object.entries(registered)) {
      assert.equal(transforms[name], fn);
      assert.deepEqual(resolve(name), { fn, param: null });
    }
  });

  it('rejects deleted and unknown names', () => {
    for (const name of [
      'copy',
      'strip-feature',
      ['replace', 'agent', 'names'].join('-'),
      'replace-tool-names',
      'replace-paths',
      'inline-runtime',
      'inject-frontmatter',
      'nonexistent',
    ]) {
      assertUnknown(name);
    }
  });

  it('rejects empty and prototype names', () => {
    for (const name of ['', ':param', '__proto__', 'constructor']) assertUnknown(name);
  });

  it('preserves parameter parsing', () => {
    assert.deepEqual(resolve('skill-metadata:claude'), { fn: skillMetadata, param: 'claude' });
    assert.deepEqual(resolve('skill-metadata:'), { fn: skillMetadata, param: null });
    assert.deepEqual(resolve('skill-metadata:a:b'), { fn: skillMetadata, param: 'a' });
  });

  it('rejects a parameterized unknown', () => {
    assert.throws(() => resolve('unknown:param'), new Error('Unknown transform: "unknown"'));
  });
});
