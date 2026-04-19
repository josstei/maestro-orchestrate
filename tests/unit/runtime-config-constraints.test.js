'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const codex = require('../../src/platforms/codex/runtime-config');
const claude = require('../../src/platforms/claude/runtime-config');
const gemini = require('../../src/platforms/gemini/runtime-config');
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

  it('gemini declares synchronous result surface', () => {
    assert.equal(gemini.delegation.constraints.result_surface, 'synchronous');
    assert.equal(gemini.delegation.constraints.child_cannot_prompt_user, false);
  });

  it('qwen declares its delegation constraints', () => {
    assert.ok(qwen.delegation);
    assert.ok(qwen.delegation.constraints);
    assert.equal(typeof qwen.delegation.constraints.result_surface, 'string');
  });

  it('gemini runtime-config does not bind workspacePath to an env var', () => {
    assert.ok(
      !gemini.env.workspacePath,
      'gemini has no CLI-injected workspace env var; workspacePath must be falsy so project-root-resolver falls through to cwd/roots'
    );
  });
});
