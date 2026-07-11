import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureWorkspace } from '../../dist/src/state/session-state.js';
import { handleRecordValidationCommands, handleGetProjectProfile } from '../../dist/src/mcp/handlers/project-profile.js';
import { withEnvSync } from '../support/environment.js';
import { makeTempDir } from '../support/filesystem.js';

function withWorkspace(testContext, fn) {
  return withEnvSync({ MAESTRO_STATE_DIR: undefined }, () => {
    const root = makeTempDir(testContext, 'maestro-rvc-');
    ensureWorkspace('docs/maestro', root);
    return fn(root);
  });
}

test('records commands and folds them into the profile arrays', (t) => withWorkspace(t, (root) => {
  const result = handleRecordValidationCommands(
    { commands: { build: ['npm run build'], test: ['npm test'] } },
    root
  );
  assert.deepEqual(result.profile.build_commands, ['npm run build']);
  assert.deepEqual(result.profile.test_commands, ['npm test']);
  assert.deepEqual(result.profile.lint_commands, []);
  assert.equal(typeof result.profile.updated, 'string');
}));

test('de-duplicates and promotes across successive calls (most-recent-first) and persists', (t) => withWorkspace(t, (root) => {
  handleRecordValidationCommands({ commands: { build: ['a'] } }, root);
  handleRecordValidationCommands({ commands: { build: ['b'] } }, root);
  const third = handleRecordValidationCommands({ commands: { build: ['a'] } }, root);
  assert.deepEqual(third.profile.build_commands, ['a', 'b']);

  const { profile } = handleGetProjectProfile({}, root);
  assert.deepEqual(profile.build_commands, ['a', 'b']);
}));

test('tolerates a missing commands object', (t) => withWorkspace(t, (root) => {
  const result = handleRecordValidationCommands({}, root);
  assert.deepEqual(result.profile.build_commands, []);
  assert.deepEqual(result.profile.test_commands, []);
  assert.deepEqual(result.profile.lint_commands, []);
}));
