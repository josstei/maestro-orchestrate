'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const codex = require('../../src/platforms/codex/runtime-config');
const claude = require('../../src/platforms/claude/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');

describe('runtime-config delegation.constraints', () => {
  it('codex declares fork incompatibility and deferred result surface', () => {
    assert.deepEqual(codex.delegation.constraints.fork_full_context_incompatible_with, [
      'agent_type',
      'model',
      'reasoning_effort',
    ]);
    assert.equal(codex.delegation.constraints.result_surface, 'deferred');
    assert.equal(codex.delegation.constraints.child_cannot_prompt_user, true);
  });

  it('claude declares synchronous result surface', () => {
    assert.equal(claude.delegation.constraints.result_surface, 'synchronous');
    assert.equal(claude.delegation.constraints.child_cannot_prompt_user, false);
  });

  it('qwen declares synchronous result surface', () => {
    assert.equal(qwen.delegation.constraints.result_surface, 'synchronous');
    assert.equal(qwen.delegation.constraints.child_cannot_prompt_user, false);
  });

  it('every runtime-config binds workspacePath to the env var its host provides', () => {
    assert.deepEqual(
      {
        claude: claude.env.workspacePath,
        codex: codex.env.workspacePath,
        qwen: qwen.env.workspacePath,
      },
      {
        claude: 'CLAUDE_PROJECT_DIR',
        codex: 'MAESTRO_WORKSPACE_PATH',
        qwen: 'workspacePath',
      }
    );
  });

  it('every runtime-config roots its generated output in the directory its host loads', () => {
    // Qwen Code loads subagents from <extension>/agents/, and the repo root
    // (where qwen-extension.json lives) is Qwen's extension dir.
    assert.deepEqual(
      {
        claude: claude.outputDir,
        codex: codex.outputDir,
        qwen: qwen.outputDir,
      },
      {
        claude: 'claude/',
        codex: 'plugins/maestro/',
        qwen: './',
      }
    );
  });
});
