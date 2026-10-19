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
      path.join('.gemini', 'config', 'plugins'),
      path.join('.gemini', 'antigravity-cli', 'plugins'),
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

  it('rejects Antigravity plugin install paths', () => {
    assert.equal(
      isExtensionCachePath('/Users/me/.gemini/config/plugins/maestro'),
      true
    );
    assert.equal(
      isExtensionCachePath('/Users/me/.gemini/antigravity-cli/plugins/maestro/mcp'),
      true
    );
  });

  it('rejects the cache directory itself, not only paths below it', () => {
    assert.equal(isExtensionCachePath('/Users/me/.codex/plugins'), true);
    assert.equal(isExtensionCachePath('/Users/me/.claude/plugins'), true);
    assert.equal(isExtensionCachePath('/Users/me/.gemini/config/plugins'), true);
    assert.equal(isExtensionCachePath('/Users/me/.gemini/antigravity-cli/plugins'), true);
  });

  it('requires every segment of a multi-segment cache directory, contiguous and in order', () => {
    for (const candidate of [
      '/a/config/plugins',
      '/Users/me/.gemini/config',
      '/Users/me/.gemini/plugins',
      '/Users/me/.gemini/antigravity-cli',
      '/Users/me/.gemini/x/config/plugins',
      '/Users/me/config/plugins/.gemini',
      '/Users/me/.gemini/config/plugins-research',
      '/Users/me/dev/.gemini-config/plugins',
    ]) {
      assert.equal(isExtensionCachePath(candidate), false, candidate);
    }
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
