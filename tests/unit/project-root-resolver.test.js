'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveProjectRoot } = require('../../src/core/project-root-resolver');
const { withEnv } = require('../support/env');
const { makeTempDir } = require('../support/fs');

describe('project root resolver', () => {
  it('prefers an explicit workspace path over inherited cwd-like env vars', () => {
    const workspaceRoot = makeTempDir('maestro-workspace-');
    const inheritedPwd = makeTempDir('maestro-pwd-');

    const result = withEnv(
      {
        MAESTRO_WORKSPACE_PATH: workspaceRoot,
        CLAUDE_PROJECT_DIR: null,
        PWD: inheritedPwd,
        INIT_CWD: null,
      },
      () => resolveProjectRoot()
    );

    assert.equal(result, workspaceRoot);
  });

  it('falls back to inherited PWD when MCP roots are unavailable', () => {
    const workspaceRoot = makeTempDir('maestro-pwd-root-');

    const result = withEnv(
      {
        MAESTRO_WORKSPACE_PATH: null,
        CLAUDE_PROJECT_DIR: null,
        PWD: workspaceRoot,
        INIT_CWD: null,
      },
      () => resolveProjectRoot()
    );

    assert.equal(result, workspaceRoot);
  });
});
