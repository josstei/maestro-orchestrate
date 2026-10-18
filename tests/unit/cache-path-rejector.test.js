'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  CACHE_PATH_SEGMENTS,
  isExtensionCachePath,
} = require('../../src/core/cache-path-rejector');

describe('cache-path-rejector', () => {
  it('exposes the canonical segment set', () => {
    assert.deepEqual(CACHE_PATH_SEGMENTS, [
      path.join('.codex', 'plugins'),
      path.join('.claude', 'plugins'),
    ]);
  });

  it('rejects Codex plugin cache paths', () => {
    assert.equal(
      isExtensionCachePath('/Users/me/.codex/plugins/cache/foo/bar'),
      true
    );
  });

  it('rejects Claude plugin cache paths', () => {
    assert.equal(
      isExtensionCachePath('/Users/me/.claude/plugins/cache/foo'),
      true
    );
  });

  it('rejects the cache directory itself, not only paths below it', () => {
    assert.equal(isExtensionCachePath('/Users/me/.codex/plugins'), true);
    assert.equal(isExtensionCachePath('/Users/me/.claude/plugins'), true);
  });

  it('no longer treats Gemini CLI extension directories as a cache', () => {
    assert.equal(
      isExtensionCachePath('/Users/me/.gemini/extensions/foo'),
      false
    );
  });

  it('allows workspace paths that merely contain the substring', () => {
    assert.equal(
      isExtensionCachePath('/Users/me/dev/my-project/.codex-plugins-research'),
      false
    );
  });

  it('allows regular project paths', () => {
    assert.equal(
      isExtensionCachePath('/Users/me/Development/maestro-orchestrate'),
      false
    );
  });
});
