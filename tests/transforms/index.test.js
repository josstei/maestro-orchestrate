const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, transforms } = require('../../src/transforms');

describe('transforms/index resolve', () => {
  it('should resolve a known transform name to its function', () => {
    const { fn, param } = resolve('copy');
    assert.equal(typeof fn, 'function');
    assert.equal(param, null);
  });

  it('should resolve all registered transform names', () => {
    const names = [
      'copy', 'strip-feature', 'replace-agent-names',
      'replace-tool-names', 'replace-paths', 'inject-frontmatter',
      'skill-metadata', 'agent-stub', 'skill-discovery-stub',
      'inline-runtime',
    ];
    for (const name of names) {
      const { fn } = resolve(name);
      assert.equal(typeof fn, 'function', `Expected ${name} to resolve to a function`);
    }
  });

  it('should throw on unknown transform name', () => {
    assert.throws(() => resolve('nonexistent'), /Unknown transform: "nonexistent"/);
  });

  it('should parse parameterized transform names', () => {
    const { fn, param } = resolve('strip-feature:exampleBlocks');
    assert.equal(typeof fn, 'function');
    assert.equal(param, 'exampleBlocks');
  });

  it('should return null param when no colon-parameter is present', () => {
    const { param } = resolve('copy');
    assert.equal(param, null);
  });

  it('should expose all transforms in the transforms object', () => {
    assert.equal(typeof transforms.copy, 'function');
    assert.equal(typeof transforms['strip-feature'], 'function');
    assert.equal(typeof transforms['replace-agent-names'], 'function');
    assert.equal(typeof transforms['replace-tool-names'], 'function');
    assert.equal(typeof transforms['replace-paths'], 'function');
    assert.equal(typeof transforms['inject-frontmatter'], 'function');
    assert.equal(typeof transforms['skill-metadata'], 'function');
    assert.equal(typeof transforms['agent-stub'], 'function');
    assert.equal(typeof transforms['skill-discovery-stub'], 'function');
    assert.equal(typeof transforms['inline-runtime'], 'function');
  });

  it('should throw for parameterized unknown transform', () => {
    assert.throws(() => resolve('unknown:param'), /Unknown transform: "unknown"/);
  });
});
