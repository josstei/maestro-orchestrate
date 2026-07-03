'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RetrievalProvider,
  Bm25Provider,
  tokenize,
} = require('../../src/mcp/retrieval/bm25-provider');

test('tokenize lowercases and splits on Unicode punctuation and whitespace', () => {
  assert.deepEqual(tokenize('src/Auth/OAuth.js  token-refresh'), [
    'src',
    'auth',
    'oauth',
    'js',
    'token',
    'refresh',
  ]);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
});

test('RetrievalProvider is an abstract seam that must be implemented', () => {
  const provider = new RetrievalProvider();
  assert.throws(() => provider.index([]), /must be implemented/);
  assert.throws(() => provider.query('x'), /must be implemented/);
});

test('Bm25Provider ranks documents by descending relevance', () => {
  const provider = new Bm25Provider();
  provider.index([
    { session_id: 'd1', text: 'auth token security oauth', summary: { session_id: 'd1' } },
    { session_id: 'd2', text: 'auth login', summary: { session_id: 'd2' } },
    { session_id: 'd3', text: 'database schema', summary: { session_id: 'd3' } },
  ]);

  const ranked = provider.query('auth token security');

  assert.deepEqual(
    ranked.map((entry) => entry.session_id),
    ['d1', 'd2', 'd3']
  );
  assert.ok(ranked[0].score > ranked[1].score);
  assert.ok(ranked[1].score > ranked[2].score);
  assert.equal(ranked[2].score, 0);
  assert.deepEqual(ranked[0].summary, { session_id: 'd1' });
});

test('Bm25Provider breaks score ties by session_id ascending, never input order', () => {
  const provider = new Bm25Provider();
  provider.index([
    { session_id: 'sess-b', text: 'auth login oauth token', summary: { session_id: 'sess-b' } },
    { session_id: 'sess-a', text: 'auth login oauth token', summary: { session_id: 'sess-a' } },
    { session_id: 'sess-c', text: 'database migration schema', summary: { session_id: 'sess-c' } },
  ]);

  const ranked = provider.query('auth login');

  assert.deepEqual(
    ranked.map((entry) => entry.session_id),
    ['sess-a', 'sess-b', 'sess-c']
  );
  assert.equal(ranked[0].score, ranked[1].score);
  assert.equal(ranked[2].score, 0);
});

test('Bm25Provider honors an explicit result limit', () => {
  const provider = new Bm25Provider();
  provider.index([
    { session_id: 'd1', text: 'auth token', summary: {} },
    { session_id: 'd2', text: 'auth token', summary: {} },
    { session_id: 'd3', text: 'auth token', summary: {} },
  ]);

  const ranked = provider.query('auth token', { limit: 2 });

  assert.equal(ranked.length, 2);
});
