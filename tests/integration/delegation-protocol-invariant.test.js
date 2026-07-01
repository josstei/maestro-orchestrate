const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { expandCoreCommands, expandEntryPoints } = require('../../scripts/generate');
const entryPointRegistry = require('../../src/entry-points/registry');
const coreCommandRegistry = require('../../src/entry-points/core-command-registry');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function runtimeEntryName(entry, runtime) {
  return entry.runtimeNames?.[runtime] || entry.name;
}

function entryOutputPath(entry, runtime) {
  const name = runtimeEntryName(entry, runtime);
  if (runtime === 'gemini') return `commands/maestro/${entry.name}.toml`;
  if (runtime === 'claude') return `claude/skills/${name}/SKILL.md`;
  if (runtime === 'codex') return `plugins/maestro/skills/${name}/SKILL.md`;
  throw new Error(`Unhandled runtime ${runtime}`);
}

function coreOutputPath(entry, runtime) {
  const name = runtimeEntryName(entry, runtime);
  if (runtime === 'gemini') return `commands/maestro/${entry.name}.toml`;
  if (runtime === 'claude') return `claude/skills/${name}/SKILL.md`;
  if (runtime === 'codex') return `plugins/maestro/skills/${name}/SKILL.md`;
  throw new Error(`Unhandled runtime ${runtime}`);
}

describe('delegation protocol invariant', () => {
  it('keeps delegation loaded for every agent-backed runtime entry point', () => {
    const runtimes = ['gemini', 'claude', 'codex'];

    for (const entry of entryPointRegistry.filter((item) => item.agents.length > 0)) {
      assert.ok(
        entry.skills.includes('delegation'),
        `${entry.name} must load delegation before using agent ${entry.agents.join(', ')}`
      );

      for (const runtime of runtimes) {
        const generated = expandEntryPoints(runtime);
        const outputPath = entryOutputPath(entry, runtime);
        const result = generated.find((item) => item.outputPath === outputPath);

        assert.ok(result, `${runtime} entry not generated for ${entry.name}`);
        assert.match(
          result.content,
          /get_skill_content[\s\S]*delegation/,
          `${outputPath} must instruct the runtime to load delegation before agent use`
        );
      }
    }
  });

  it('keeps execution and resume commands preloading delegation methodology', () => {
    const runtimes = ['gemini', 'claude', 'codex'];
    const delegatingCoreCommands = coreCommandRegistry.filter((entry) =>
      ['execute', 'resume'].includes(entry.name)
    );

    for (const entry of delegatingCoreCommands) {
      assert.ok(
        entry.preload.includes('delegation'),
        `${entry.name} must preload delegation methodology`
      );

      for (const runtime of runtimes) {
        const generated = expandCoreCommands(runtime);
        const outputPath = coreOutputPath(entry, runtime);
        const result = generated.find((item) => item.outputPath === outputPath);

        assert.ok(result, `${runtime} core entry not generated for ${entry.name}`);
        assert.match(
          result.content,
          /get_skill_content[\s\S]*delegation/,
          `${outputPath} must instruct the runtime to load delegation`
        );
      }
    }
  });

  it('keeps shared protocols loaded and prepended before agent-specific prompts', () => {
    const delegation = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'skills', 'shared', 'delegation', 'SKILL.md'),
      'utf8'
    );
    const baseIndex = delegation.indexOf('Load `agent-base-protocol`');
    const filesystemIndex = delegation.indexOf('Load `filesystem-safety-protocol`');
    const prependIndex = delegation.indexOf('Prepend both protocols');

    assert.ok(baseIndex >= 0, 'delegation skill must load agent-base-protocol');
    assert.ok(filesystemIndex > baseIndex, 'filesystem safety must load after base protocol');
    assert.ok(prependIndex > filesystemIndex, 'delegation skill must prepend both protocols');
    assert.match(
      delegation,
      /base protocol first, then filesystem safety/,
      'delegation skill must define protocol injection order'
    );
  });

  it('keeps orchestration steps injecting protocols before phase delegation', () => {
    const steps = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'references', 'orchestration-steps.md'),
      'utf8'
    );
    const standardInjection = steps.indexOf(
      'Call `get_skill_content` with resources: ["delegation", "validation", "agent-base-protocol", "filesystem-safety-protocol"]'
    );
    const standardDelegation = steps.indexOf('For each phase (or parallel batch): call `get_agent`');
    const expressInjection = steps.indexOf(
      'Call `get_skill_content` with resources: ["agent-base-protocol", "filesystem-safety-protocol"]'
    );
    const expressDelegation = steps.indexOf('Delegate to the assigned agent.');

    assert.ok(standardInjection >= 0, 'standard workflow must load shared protocols');
    assert.ok(standardDelegation > standardInjection, 'standard workflow must inject before delegation');
    assert.ok(expressInjection >= 0, 'express workflow must load shared protocols');
    assert.ok(expressDelegation > expressInjection, 'express workflow must inject before delegation');
  });
});
