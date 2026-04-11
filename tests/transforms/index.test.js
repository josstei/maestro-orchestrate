const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, transforms } = require('../../src/transforms');

describe('transforms/index resolve', () => {
  it('resolves all remaining registered transform names', () => {
    const names = [
      'inject-frontmatter',
      'skill-metadata',
      'agent-stub',
      'skill-discovery-stub',
    ];
    for (const name of names) {
      const { fn } = resolve(name);
      assert.equal(typeof fn, 'function', `Expected ${name} to resolve to a function`);
    }
  });

  it('throws on deleted and unknown transform names', () => {
    const names = [
      'copy',
      'strip-feature',
      'replace-agent-names',
      'replace-tool-names',
      'replace-paths',
      'inline-runtime',
      'nonexistent',
    ];

    for (const name of names) {
      assert.throws(() => resolve(name), new RegExp(`Unknown transform: "${name}"`));
    }
  });

  it('parses parameterized transform names for the remaining registry', () => {
    const { fn, param } = resolve('skill-metadata:claude');
    assert.equal(typeof fn, 'function');
    assert.equal(param, 'claude');
  });

  it('returns null param when no colon-parameter is present', () => {
    const { param } = resolve('agent-stub');
    assert.equal(param, null);
  });

  it('exposes only the remaining transforms in the transforms object', () => {
    assert.deepEqual(
      Object.keys(transforms).sort(),
      ['agent-stub', 'inject-frontmatter', 'skill-discovery-stub', 'skill-metadata']
    );
    assert.equal(typeof transforms['inject-frontmatter'], 'function');
    assert.equal(typeof transforms['skill-metadata'], 'function');
    assert.equal(typeof transforms['agent-stub'], 'function');
    assert.equal(typeof transforms['skill-discovery-stub'], 'function');
  });

  it('throws for parameterized unknown transform', () => {
    assert.throws(() => resolve('unknown:param'), /Unknown transform: "unknown"/);
  });
});
