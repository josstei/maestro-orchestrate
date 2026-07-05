import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeValidationCommands } from '../../src/mcp/memory/memory-store.js';

const EMPTY_PROFILE = {
  schema_version: 1,
  build_commands: [],
  test_commands: [],
  lint_commands: [],
  conventions: ['two-space-indent'],
  do_not_touch: [],
  preferred_agents: [],
  blocked_agents: [],
  updated: null,
};

test('folds incoming commands into an empty profile, preserving order', () => {
  const merged = mergeValidationCommands(EMPTY_PROFILE, {
    build: ['npm run build'],
    test: ['npm test', 'npm run e2e'],
    lint: ['npm run lint'],
  });
  assert.deepEqual(merged.build_commands, ['npm run build']);
  assert.deepEqual(merged.test_commands, ['npm test', 'npm run e2e']);
  assert.deepEqual(merged.lint_commands, ['npm run lint']);
});

test('de-duplicates and promotes re-recorded commands to the front (most-recent-first)', () => {
  const first = mergeValidationCommands(EMPTY_PROFILE, { build: ['a'] });
  assert.deepEqual(first.build_commands, ['a']);
  const second = mergeValidationCommands(first, { build: ['b'] });
  assert.deepEqual(second.build_commands, ['b', 'a']);
  const third = mergeValidationCommands(second, { build: ['a'] });
  assert.deepEqual(third.build_commands, ['a', 'b']);
});

test('drops non-string, empty, and duplicate incoming entries', () => {
  const merged = mergeValidationCommands(EMPTY_PROFILE, {
    test: ['npm test', '  ', 'npm test', 42, null, '  go test ./... '],
  });
  assert.deepEqual(merged.test_commands, ['npm test', 'go test ./...']);
});

test('preserves unrelated profile fields and refreshes updated', () => {
  const merged = mergeValidationCommands(EMPTY_PROFILE, { build: ['make'] });
  assert.deepEqual(merged.conventions, ['two-space-indent']);
  assert.equal(merged.schema_version, 1);
  assert.equal(typeof merged.updated, 'string');
  assert.ok(Number.isFinite(Date.parse(merged.updated)));
});

test('tolerates a missing incoming object and missing profile arrays', () => {
  const merged = mergeValidationCommands({ build_commands: ['keep'] }, undefined);
  assert.deepEqual(merged.build_commands, ['keep']);
  assert.deepEqual(merged.test_commands, []);
  assert.deepEqual(merged.lint_commands, []);
});
