'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolve } = require('../../src/transforms');
const manifestRules = require('../../src/manifest');

describe('transforms/index resolve', () => {
  it('resolves every transform the manifest uses', () => {
    const names = [...new Set(manifestRules.flatMap((rule) => rule.transforms))].sort();
    assert.deepEqual(names, ['agent-stub', 'skill-discovery-stub']);
    for (const name of names) {
      const fn = resolve(name);
      assert.equal(typeof fn, 'function', `Expected ${name} to resolve to a function`);
    }
  });

  it('throws on deleted and unknown transform names', () => {
    const names = [
      'inject-frontmatter',
      'rebuild-frontmatter',
      'index',
      'toString',
      'nonexistent',
    ];

    for (const name of names) {
      assert.throws(() => resolve(name), new RegExp(`Unknown transform: "${name}"`));
    }
  });
});
