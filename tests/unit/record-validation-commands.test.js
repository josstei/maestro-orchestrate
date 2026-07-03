'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { ensureWorkspace } = require('../../src/state/session-state');
const {
  handleRecordValidationCommands,
  handleGetProjectProfile,
} = require('../../src/mcp/handlers/project-profile');

function makeWorkspace() {
  delete process.env.MAESTRO_STATE_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-rvc-'));
  ensureWorkspace('docs/maestro', root);
  return root;
}

test('records commands and folds them into the profile arrays', () => {
  const root = makeWorkspace();
  const result = handleRecordValidationCommands(
    { commands: { build: ['npm run build'], test: ['npm test'] } },
    root
  );
  assert.deepEqual(result.profile.build_commands, ['npm run build']);
  assert.deepEqual(result.profile.test_commands, ['npm test']);
  assert.deepEqual(result.profile.lint_commands, []);
  assert.equal(typeof result.profile.updated, 'string');
  fs.rmSync(root, { recursive: true, force: true });
});

test('de-duplicates and promotes across successive calls (most-recent-first) and persists', () => {
  const root = makeWorkspace();
  handleRecordValidationCommands({ commands: { build: ['a'] } }, root);
  handleRecordValidationCommands({ commands: { build: ['b'] } }, root);
  const third = handleRecordValidationCommands({ commands: { build: ['a'] } }, root);
  assert.deepEqual(third.profile.build_commands, ['a', 'b']);

  const { profile } = handleGetProjectProfile({}, root);
  assert.deepEqual(profile.build_commands, ['a', 'b']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('tolerates a missing commands object', () => {
  const root = makeWorkspace();
  const result = handleRecordValidationCommands({}, root);
  assert.deepEqual(result.profile.build_commands, []);
  assert.deepEqual(result.profile.test_commands, []);
  assert.deepEqual(result.profile.lint_commands, []);
  fs.rmSync(root, { recursive: true, force: true });
});
