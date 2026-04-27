'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AgentAllocator, MINIMUM_MATCH_SCORE, FALLBACK_AGENT } = require('../../src/lib/agent-allocator');

test('MINIMUM_MATCH_SCORE equals 2', () => {
  assert.strictEqual(MINIMUM_MATCH_SCORE, 2);
});

test('FALLBACK_AGENT equals coder', () => {
  assert.strictEqual(FALLBACK_AGENT, 'coder');
});

test('allocate picks the best matching agent by signal overlap', () => {
  const roster = [
    { name: 'security-engineer', frontmatter: { signals: ['security', 'auth', 'crypto'] } },
    { name: 'performance-engineer', frontmatter: { signals: ['performance', 'optimization'] } },
  ];
  const allocator = new AgentAllocator(roster);
  const result = allocator.allocate('implement encryption with crypto authorization');

  assert.strictEqual(result.agent, 'security-engineer');
  assert.ok(result.score >= MINIMUM_MATCH_SCORE);
  assert.strictEqual(result.fell_back, false);
  assert.ok(Array.isArray(result.matched_signals));
  assert.ok('agent' in result);
  assert.ok('score' in result);
  assert.ok('matched_signals' in result);
  assert.ok('fell_back' in result);
});

test('allocate falls back to coder when no agent meets minimum match score', () => {
  const roster = [
    { name: 'seo-specialist', frontmatter: { signals: ['seo', 'meta-tags'] } },
    { name: 'i18n-engineer', frontmatter: { signals: ['i18n', 'l10n'] } },
  ];
  const allocator = new AgentAllocator(roster);
  const result = allocator.allocate('build a simple button component');

  assert.strictEqual(result.agent, FALLBACK_AGENT);
  assert.strictEqual(result.fell_back, true);
  assert.strictEqual(result.score, 0);
});

test('allocate returns first roster entry when two agents tie on score', () => {
  const roster = [
    { name: 'agent-alpha', frontmatter: { signals: ['auth', 'crypto'] } },
    { name: 'agent-beta', frontmatter: { signals: ['auth', 'crypto'] } },
  ];
  const allocator = new AgentAllocator(roster);
  const result = allocator.allocate('authentication crypto implementation');

  assert.strictEqual(result.agent, 'agent-alpha');
  assert.strictEqual(result.fell_back, false);
});

test('_extractSignals captures multiple signals from compound text', () => {
  const allocator = new AgentAllocator([]);
  const signals = allocator._extractSignals('build api scaffold with documentation');

  assert.ok(signals.includes('implementation'), 'expected implementation signal');
  assert.ok(signals.includes('scaffold'), 'expected scaffold signal');
  assert.ok(signals.includes('api'), 'expected api signal');
  assert.ok(signals.includes('docs'), 'expected docs signal');
});

test('allocate returns fallback for empty roster', () => {
  const allocator = new AgentAllocator([]);
  const result = allocator.allocate('implement auth with crypto');

  assert.strictEqual(result.agent, FALLBACK_AGENT);
  assert.strictEqual(result.fell_back, true);
});

test('allocate returns fallback for empty deliverable text', () => {
  const roster = [
    { name: 'security-engineer', frontmatter: { signals: ['security', 'auth', 'crypto'] } },
  ];
  const allocator = new AgentAllocator(roster);
  const result = allocator.allocate('');

  assert.strictEqual(result.agent, FALLBACK_AGENT);
  assert.strictEqual(result.fell_back, true);
});

test('allocate does not throw on non-string deliverable', () => {
  const roster = [
    { name: 'security-engineer', frontmatter: { signals: ['security', 'auth', 'crypto'] } },
  ];
  const allocator = new AgentAllocator(roster);

  assert.doesNotThrow(() => allocator.allocate(null));
  assert.doesNotThrow(() => allocator.allocate(undefined));
  assert.doesNotThrow(() => allocator.allocate(42));
});

test('allocate normalizes agent signals before matching', () => {
  const roster = [
    { name: 'auth-agent', frontmatter: { signals: ['  Auth  ', '  CRYPTO  '] } },
  ];
  const allocator = new AgentAllocator(roster);
  const result = allocator.allocate('authentication crypto implementation');

  assert.strictEqual(result.agent, 'auth-agent');
  assert.strictEqual(result.fell_back, false);
  assert.ok(result.score >= MINIMUM_MATCH_SCORE);
});

test('deduplicates signals extracted from synonym-rich text', () => {
  const allocator = new AgentAllocator([
    { name: 'security-engineer', frontmatter: { signals: ['auth'] } },
  ]);
  const r = allocator.allocate('authentication and authorization with auth tokens');
  assert.deepEqual(r.matched_signals, ['auth']);
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.fell_back, true);
});

test('reaches mainframe specialists via mainframe-specific keywords', () => {
  const allocator = new AgentAllocator([
    { name: 'cobol-engineer', frontmatter: { signals: ['mainframe', 'cobol'] } },
    { name: 'coder', frontmatter: { signals: ['implementation', 'scaffold'] } },
  ]);
  const r = allocator.allocate('modernize a cobol batch on z/os mainframe');
  assert.strictEqual(r.agent, 'cobol-engineer');
  assert.strictEqual(r.fell_back, false);
});
