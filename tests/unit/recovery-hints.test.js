'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getRecoveryHint } = require('../../src/mcp/core/recovery-hints');

const START_FRESH_HINT =
  'Call get_session_status to check the current session, then archive_session if you want to start fresh.';
const WRITABLE_HINT = 'Check that the target directory is writable.';

describe('getRecoveryHint', () => {
  it('provides code-specific state recovery instructions before matching old message patterns', () => {
    for (const [code, instruction] of [
      ['STATE_BUSY', /Wait for it to finish/],
      ['STATE_RECOVERED', /inspect the recovered state/],
      ['STATE_RECOVERY_REQUIRED', /Keep the transaction journal intact/],
      ['STATE_CONFLICT', /new expected hash/],
    ]) {
      assert.match(getRecoveryHint('update_session', 'ENOENT', code), instruction);
    }
  });

  for (const [name, tool, message, expected] of [
    ['returns hint for create_session "already exists" error',
      'create_session', 'session already exists at this path', START_FRESH_HINT],
    ['returns hint for transition_phase "not found" error',
      'transition_phase', 'session not found',
      'Call get_session_status to verify the current session and phase IDs.'],
    ['returns hint for update_session "ENOENT" error',
      'update_session', 'ENOENT: no such file or directory',
      'Call get_session_status to verify a session exists before updating.'],
    ['returns null for archive_session errors, which have no recovery row',
      'archive_session', "ENOENT: no such file or directory, open '[path]'", null],
    ['returns hint for update_session "updatable field" error',
      'update_session', 'must provide at least one updatable field',
      'Provide at least one of: execution_mode, execution_backend, current_batch.'],
    ['returns hint for initialize_workspace "EACCES" error',
      'initialize_workspace', 'EACCES: permission denied', WRITABLE_HINT],
    ['returns hint for initialize_workspace "EPERM" error',
      'initialize_workspace', 'EPERM: operation not permitted', WRITABLE_HINT],
    ['returns null for unknown tool name',
      'unknown_tool', 'already exists', null],
    ['returns null for known tool with non-matching error message',
      'create_session', 'unexpected internal error', null],
    ['matches case-insensitively for "Already Exists"',
      'create_session', 'Already Exists', START_FRESH_HINT],
  ]) {
    it(name, () => {
      assert.equal(getRecoveryHint(tool, message), expected);
    });
  }
});
