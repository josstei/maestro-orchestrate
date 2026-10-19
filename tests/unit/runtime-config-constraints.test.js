'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const antigravity = require('../../src/platforms/antigravity/runtime-config');
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

  it('antigravity declares notified result surface', () => {
    // invoke_subagent returns conversation IDs; each child's final response
    // arrives later as a system message.
    assert.deepEqual(antigravity.delegation.constraints, {
      result_surface: 'notified',
      child_cannot_prompt_user: false,
    });
  });

  it('every runtime-config binds workspacePath to the env var its host provides', () => {
    assert.deepEqual(
      {
        antigravity: antigravity.env.workspacePath,
        claude: claude.env.workspacePath,
        codex: codex.env.workspacePath,
        qwen: qwen.env.workspacePath,
      },
      {
        antigravity: 'MAESTRO_WORKSPACE_PATH',
        claude: 'CLAUDE_PROJECT_DIR',
        codex: 'MAESTRO_WORKSPACE_PATH',
        qwen: 'workspacePath',
      }
    );
  });

  it('every runtime-config roots its generated output in the directory its host loads', () => {
    // Qwen Code loads subagents from <extension>/agents/, and the repo root
    // (where qwen-extension.json lives) is Qwen's extension dir. `agy plugin
    // install` copies the single antigravity/ plugin directory.
    assert.deepEqual(
      {
        antigravity: antigravity.outputDir,
        claude: claude.outputDir,
        codex: codex.outputDir,
        qwen: qwen.outputDir,
      },
      {
        antigravity: 'antigravity/',
        claude: 'claude/',
        codex: 'plugins/maestro/',
        qwen: './',
      }
    );
  });

  it('only antigravity marks its MCP tools always-loaded', () => {
    // Antigravity registers a tool marked antigravity/alwaysLoad as the native
    // tool mcp_maestro_maestro_<tool> instead of loading it on demand.
    assert.deepEqual(antigravity.mcpToolMeta, { 'antigravity/alwaysLoad': true });
    assert.equal(antigravity.mcpPrefix, 'mcp_maestro_maestro_');
    for (const config of [claude, codex, qwen]) {
      assert.equal(config.mcpToolMeta, undefined, config.name);
    }
  });
});
