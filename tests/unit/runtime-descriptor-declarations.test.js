import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getRuntimeGeneration, getAgentToolDialect } from '../../dist/src/platforms/runtime-descriptor.js';
import gemini, { GEMINI_RUNTIME_CONFIG } from '../../dist/src/platforms/gemini/runtime-config.js';
import claude, { CLAUDE_RUNTIME_CONFIG } from '../../dist/src/platforms/claude/runtime-config.js';
import codex, { CODEX_RUNTIME_CONFIG } from '../../dist/src/platforms/codex/runtime-config.js';
import qwen, { QWEN_RUNTIME_CONFIG } from '../../dist/src/platforms/qwen/runtime-config.js';
import { getRuntimeConfig } from '../../dist/src/platforms/runtime-declarations.js';

describe('runtime generation descriptors define each host projection', () => {
  it('exports named typed configs consumed by the static catalog', () => {
    assert.equal(gemini, GEMINI_RUNTIME_CONFIG);
    assert.equal(claude, CLAUDE_RUNTIME_CONFIG);
    assert.equal(codex, CODEX_RUNTIME_CONFIG);
    assert.equal(qwen, QWEN_RUNTIME_CONFIG);
    for (const config of [gemini, claude, codex, qwen]) {
      assert.equal(getRuntimeConfig(config.name), config);
    }
  });

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
