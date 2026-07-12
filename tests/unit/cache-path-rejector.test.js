import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { importDist } from '../support/dist.js';

const workspacePath = await importDist('src/core/project-root-resolver.js');
const compatibilityModule = await importDist('src/mcp/contracts/cache-path-rejector.js');
const {
  CACHE_PATH_SEGMENTS,
  extractClientRootCandidates,
  isExtensionCachePath,
  isPlaceholderPath,
  normalizeExistingWorkspaceCandidate,
  parseFileRootCandidate,
} = workspacePath;

describe('cache-path-rejector', () => {
  it('preserves the compatibility re-export', () => {
    assert.equal(compatibilityModule.CACHE_PATH_SEGMENTS, CACHE_PATH_SEGMENTS);
    assert.equal(compatibilityModule.isExtensionCachePath, isExtensionCachePath);
  });

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

  it('rejects invalid cache-path values without coercing them', () => {
    assert.equal(isExtensionCachePath(null), false);
    assert.equal(isExtensionCachePath({ path: '/Users/me/.codex/plugins/foo' }), false);
  });
});

describe('workspace-path primitives', () => {
  it('recognizes unresolved placeholder paths', () => {
    assert.equal(isPlaceholderPath('${workspaceFolder}/project'), true);
    assert.equal(isPlaceholderPath('/Users/me/project'), false);
    assert.equal(isPlaceholderPath(null), false);
  });

  it('decodes file roots and rejects malformed or non-file URIs', () => {
    const candidate = path.join(path.sep, 'tmp', 'maestro workspace');
    assert.equal(parseFileRootCandidate(pathToFileURL(candidate).href), candidate);
    assert.equal(parseFileRootCandidate('https://example.com/workspace'), null);
    assert.equal(parseFileRootCandidate('not a URI'), null);
  });

  it('extracts valid client roots in input order', () => {
    const first = path.join(path.sep, 'tmp', 'maestro-first');
    const second = path.join(path.sep, 'tmp', 'maestro-second');
    assert.deepEqual(
      extractClientRootCandidates([
        { uri: 'https://example.com/ignored' },
        { uri: pathToFileURL(first).href },
        'malformed',
        pathToFileURL(second).href,
      ]),
      [first, second]
    );
  });

  it('normalizes only existing non-placeholder candidates', () => {
    const candidate = path.join('relative', 'workspace');
    const expected = path.resolve(candidate);
    const observed = [];
    const exists = (value) => {
      observed.push(value);
      return value === expected;
    };

    assert.equal(normalizeExistingWorkspaceCandidate(candidate, { exists }), expected);
    assert.deepEqual(observed, [expected]);
    assert.equal(normalizeExistingWorkspaceCandidate('${workspaceFolder}', { exists }), null);
    assert.deepEqual(observed, [expected]);
  });

  it('optionally rejects existing extension-cache candidates', () => {
    const candidate = path.join(path.sep, 'Users', 'me', '.codex', 'plugins', 'maestro');
    assert.equal(
      normalizeExistingWorkspaceCandidate(candidate, {
        exists: () => true,
        rejectExtensionCache: true,
      }),
      null
    );
    assert.equal(
      normalizeExistingWorkspaceCandidate(candidate, { exists: () => true }),
      candidate
    );
  });
});
