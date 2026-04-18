'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  CACHE_PATH_SEGMENTS,
  isExtensionCachePath,
} = require('../../src/mcp/contracts/cache-path-rejector');

describe('cache-path-rejector', () => {
  it('exposes the canonical segment set', () => {
    assert.deepEqual(CACHE_PATH_SEGMENTS, [
      path.join('.codex', 'plugins'),
      path.join('.claude', 'plugins'),
      path.join('.gemini', 'extensions'),
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

  it('rejects Gemini extension paths', () => {
    assert.equal(
      isExtensionCachePath('/Users/me/.gemini/extensions/foo'),
      true
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
