'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  translateEphemeralPath,
  EPHEMERAL_ROOTS,
  loadEphemeralRoots,
} = require('../../src/platforms/shared/plan-paths/translate-ephemeral-path');

const FAKE_HOME = path.sep === '/' ? '/home/tester' : 'C:\\Users\\tester';
const TEST_ROOTS = Object.freeze([
  Object.freeze({ runtime: 'gemini', segments: Object.freeze(['.gemini', 'tmp']) }),
  Object.freeze({ runtime: 'qwen', segments: Object.freeze(['.qwen', 'tmp']) }),
]);

function under(home, ...segments) {
  return path.join(home, ...segments);
}

describe('translateEphemeralPath — pure detection', () => {
  it('returns isEphemeral=false for empty input', () => {
    assert.deepEqual(translateEphemeralPath('', { home: FAKE_HOME, roots: TEST_ROOTS }), {
      isEphemeral: false,
      runtime: null,
      absolute: '',
    });
  });

  it('returns isEphemeral=false for non-string input', () => {
    const r = translateEphemeralPath(null, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, false);
    assert.equal(r.runtime, null);
  });

  it('detects a Gemini ephemeral path', () => {
    const p = under(FAKE_HOME, '.gemini', 'tmp', 'abc-uuid', 'plans', 'design.md');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, true);
    assert.equal(r.runtime, 'gemini');
    assert.equal(r.absolute, p);
  });

  it('detects a Qwen ephemeral path', () => {
    const p = under(FAKE_HOME, '.qwen', 'tmp', 'sess-1', 'plan.md');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, true);
    assert.equal(r.runtime, 'qwen');
  });

  it('returns isEphemeral=false for paths outside any ephemeral root', () => {
    const p = under(FAKE_HOME, 'project', 'plans', 'design.md');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, false);
    assert.equal(r.runtime, null);
    assert.equal(r.absolute, p);
  });

  it('rejects sibling directories that share a prefix (path-segment match, not includes)', () => {
    const p = under(FAKE_HOME, '.gemini-other', 'tmp', 'design.md');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, false);
  });

  it('rejects interior segment that spells .gemini/tmp', () => {
    const p = under(FAKE_HOME, 'project', '.gemini', 'tmp', 'design.md');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, false);
  });

  it('matches the root itself as ephemeral', () => {
    const p = under(FAKE_HOME, '.gemini', 'tmp');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, true);
    assert.equal(r.runtime, 'gemini');
  });

  it('resolves relative paths against home before matching', () => {
    const r = translateEphemeralPath('.gemini/tmp/abc/design.md', {
      home: FAKE_HOME,
      roots: TEST_ROOTS,
    });
    assert.equal(r.isEphemeral, true);
    assert.equal(r.runtime, 'gemini');
    assert.equal(r.absolute, under(FAKE_HOME, '.gemini', 'tmp', 'abc', 'design.md'));
  });

  it('normalizes absolute paths (strips trailing separator behavior)', () => {
    const noisy = under(FAKE_HOME, '.gemini', 'tmp', 'a', '..', 'a', 'design.md');
    const r = translateEphemeralPath(noisy, { home: FAKE_HOME, roots: TEST_ROOTS });
    assert.equal(r.isEphemeral, true);
    assert.equal(r.absolute, under(FAKE_HOME, '.gemini', 'tmp', 'a', 'design.md'));
  });

  it('returns isEphemeral=false when roots list is empty', () => {
    const p = under(FAKE_HOME, '.gemini', 'tmp', 'design.md');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: [] });
    assert.equal(r.isEphemeral, false);
  });

  it('reports first matching runtime when multiple roots could overlap', () => {
    const overlapping = Object.freeze([
      Object.freeze({ runtime: 'first', segments: Object.freeze(['.shared']) }),
      Object.freeze({ runtime: 'second', segments: Object.freeze(['.shared', 'inner']) }),
    ]);
    const p = under(FAKE_HOME, '.shared', 'inner', 'design.md');
    const r = translateEphemeralPath(p, { home: FAKE_HOME, roots: overlapping });
    assert.equal(r.isEphemeral, true);
    assert.equal(r.runtime, 'first');
  });
});

describe('translateEphemeralPath — runtime-config integration', () => {
  it('EPHEMERAL_ROOTS is frozen', () => {
    assert.equal(Object.isFrozen(EPHEMERAL_ROOTS), true);
  });

  it('discovers the Gemini ephemeral root from runtime-config', () => {
    const found = EPHEMERAL_ROOTS.find((r) => r.runtime === 'gemini');
    assert.ok(found, 'expected gemini root to be discovered');
    assert.deepEqual([...found.segments], ['.gemini', 'tmp']);
  });

  it('discovers the Qwen ephemeral root from runtime-config', () => {
    const found = EPHEMERAL_ROOTS.find((r) => r.runtime === 'qwen');
    assert.ok(found, 'expected qwen root to be discovered');
    assert.deepEqual([...found.segments], ['.qwen', 'tmp']);
  });

  it('does not include claude or codex (they declare no ephemeral roots)', () => {
    const claudeRoot = EPHEMERAL_ROOTS.find((r) => r.runtime === 'claude');
    const codexRoot = EPHEMERAL_ROOTS.find((r) => r.runtime === 'codex');
    assert.equal(claudeRoot, undefined);
    assert.equal(codexRoot, undefined);
  });

  it('loadEphemeralRoots is idempotent across calls', () => {
    const a = loadEphemeralRoots();
    const b = loadEphemeralRoots();
    assert.deepEqual(
      a.map((r) => ({ runtime: r.runtime, segments: [...r.segments] })),
      b.map((r) => ({ runtime: r.runtime, segments: [...r.segments] }))
    );
  });

  it('uses real home when no override provided (smoke test)', () => {
    const p = path.join(require('node:os').homedir(), '.gemini', 'tmp', 'session', 'design.md');
    const r = translateEphemeralPath(p);
    assert.equal(r.isEphemeral, true);
    assert.equal(r.runtime, 'gemini');
  });
});
