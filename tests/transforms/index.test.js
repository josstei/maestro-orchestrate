const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, transforms } = require('../../src/transforms');

describe('transforms/index resolve', () => {
  it('resolves all remaining registered transform names', () => {
    const names = [
      'rebuild-frontmatter',
      'agent-stub',
      'skill-discovery-stub',
    ];
    for (const name of names) {
      const fn = resolve(name);
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
      'inject-frontmatter',
      'parse-frontmatter',
      'extract-examples',
      'skill-metadata',
      'nonexistent',
    ];

    for (const name of names) {
      assert.throws(() => resolve(name), new RegExp(`Unknown transform: "${name}"`));
    }
  });

  it('exposes only the remaining transforms in the transforms object', () => {
    assert.deepEqual(
      Object.keys(transforms).sort(),
      ['agent-stub', 'rebuild-frontmatter', 'skill-discovery-stub']
    );
    assert.equal(typeof transforms['rebuild-frontmatter'], 'function');
    assert.equal(typeof transforms['agent-stub'], 'function');
    assert.equal(typeof transforms['skill-discovery-stub'], 'function');
  });
});
