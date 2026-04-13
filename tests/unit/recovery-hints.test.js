'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getRecoveryHint } = require('../../src/mcp/core/recovery-hints');

describe('getRecoveryHint', () => {
  it('returns hint for create_session "already exists" error', () => {
    const hint = getRecoveryHint('create_session', 'session already exists at this path');
    assert.equal(
      hint,
      'Call get_session_status to check the current session, then archive_session if you want to start fresh.'
    );
  });

  it('returns hint for transition_phase "not found" error', () => {
    const hint = getRecoveryHint('transition_phase', 'session not found');
    assert.equal(hint, 'Call get_session_status to verify the current session and phase IDs.');
  });

  it('returns hint for archive_session "no active session" error', () => {
    const hint = getRecoveryHint('archive_session', 'no active session found');
    assert.equal(hint, 'Call get_session_status first to verify a session exists.');
  });

  it('returns hint for update_session "ENOENT" error', () => {
    const hint = getRecoveryHint('update_session', 'ENOENT: no such file or directory');
    assert.equal(hint, 'Call get_session_status to verify a session exists before updating.');
  });

  it('returns hint for update_session "no active session" error', () => {
    const hint = getRecoveryHint('update_session', 'no active session found');
    assert.equal(hint, 'Call get_session_status to verify a session exists before updating.');
  });

  it('returns hint for update_session "updatable field" error', () => {
    const hint = getRecoveryHint('update_session', 'must provide at least one updatable field');
    assert.equal(hint, 'Provide at least one of: execution_mode, execution_backend, current_batch.');
  });

  it('returns hint for initialize_workspace "EACCES" error', () => {
    const hint = getRecoveryHint('initialize_workspace', 'EACCES: permission denied');
    assert.equal(hint, 'Check that the target directory is writable.');
  });

  it('returns hint for initialize_workspace "EPERM" error', () => {
    const hint = getRecoveryHint('initialize_workspace', 'EPERM: operation not permitted');
    assert.equal(hint, 'Check that the target directory is writable.');
  });

  it('returns null for unknown tool name', () => {
    const hint = getRecoveryHint('unknown_tool', 'already exists');
    assert.equal(hint, null);
  });

  it('returns null for known tool with non-matching error message', () => {
    const hint = getRecoveryHint('create_session', 'unexpected internal error');
    assert.equal(hint, null);
  });

  it('matches case-insensitively for "Already Exists"', () => {
    const hint = getRecoveryHint('create_session', 'Already Exists');
    assert.equal(
      hint,
      'Call get_session_status to check the current session, then archive_session if you want to start fresh.'
    );
  });
});
