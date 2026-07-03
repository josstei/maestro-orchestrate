'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getRuntimeGeneration, getAgentToolDialect } = require('../../src/platforms/runtime-descriptor');
const gemini = require('../../src/platforms/gemini/runtime-config');
const claude = require('../../src/platforms/claude/runtime-config');
const codex = require('../../src/platforms/codex/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');

describe('runtime generation descriptors mirror the historical hardcoded maps', () => {
  it('gemini entry-point + core-command + hooks', () => {
    const g = getRuntimeGeneration(gemini);
    assert.equal(g.entryPoint.templateFile, 'gemini-command.toml.tmpl');
    assert.equal(g.entryPoint.outputPath({ name: 'orchestrate' }), 'commands/maestro/orchestrate.toml');
    assert.equal(g.entryPoint.preamblePlaceholder, 'skills_block');
    assert.equal(g.coreCommand.templateFile, 'gemini-core-command.toml.tmpl');
    assert.equal(g.coreCommand.outputPath({ name: 'execute' }), 'commands/maestro/execute.toml');
    assert.deepEqual(g.hooks, { family: 'gemini-family', configOutputPath: 'hooks/hooks.json' });
  });

  it('claude entry-point + core-command + hooks', () => {
    const g = getRuntimeGeneration(claude);
    assert.equal(g.entryPoint.templateFile, 'claude-skill.md.tmpl');
    assert.equal(g.entryPoint.outputPath({ name: 'review-code' }), 'claude/skills/review-code/SKILL.md');
    assert.equal(g.entryPoint.preamblePlaceholder, 'protocol_block');
    assert.equal(g.coreCommand.templateFile, 'claude-core-command.md.tmpl');
    assert.equal(g.coreCommand.outputPath({ name: 'orchestrate' }), 'claude/skills/orchestrate/SKILL.md');
    assert.deepEqual(g.hooks, { family: 'claude', configOutputPath: 'claude/hooks/claude-hooks.json' });
  });

  it('codex entry-point + core-command, no hook surface', () => {
    const g = getRuntimeGeneration(codex);
    assert.equal(g.entryPoint.templateFile, 'codex-skill.md.tmpl');
    assert.equal(g.entryPoint.outputPath({ name: 'security-audit' }), 'plugins/maestro/skills/security-audit/SKILL.md');
    assert.equal(g.entryPoint.preamblePlaceholder, 'refs_list');
    assert.equal(g.coreCommand.templateFile, 'codex-core-command.md.tmpl');
    assert.equal(g.coreCommand.outputPath({ name: 'orchestrate' }), 'plugins/maestro/skills/orchestrate/SKILL.md');
    assert.equal(g.hooks, null);
  });

  it('qwen emits no command surface and reuses the gemini-family hook renderer', () => {
    const g = getRuntimeGeneration(qwen);
    assert.equal(g.entryPoint, null);
    assert.equal(g.coreCommand, null);
    assert.deepEqual(g.hooks, { family: 'gemini-family', configOutputPath: 'qwen/hooks.json' });
  });

  it('gemini declares an identity agent tool dialect; the others declare none', () => {
    assert.deepEqual(getAgentToolDialect(gemini), {});
    assert.equal(getAgentToolDialect(claude), null);
    assert.equal(getAgentToolDialect(codex), null);
    assert.equal(getAgentToolDialect(qwen), null);
  });
});
