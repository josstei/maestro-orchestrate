'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  expandGlob,
  computeOutputPath,
  assertNoMirroredSharedOutputs,
  expandManifest,
} = require('../../src/generator/manifest-expander');
const manifestRules = require('../../src/manifest');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { AGENT_COUNT, SHARED_SKILL_COUNT } = require('../support/catalog');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

describe('manifest-expander', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTempDir('manifest-expander-');
    for (const relPath of [
      'agents/foo-bar.md',
      'agents/baz.md',
      'agents/qux-thing.md',
      'skills/shared/delegation/SKILL.md',
      'skills/shared/execution/SKILL.md',
      'docs/readme.txt',
      'docs/guide.md',
    ]) {
      writeTree(tmpDir, relPath);
    }
  });

  describe('expandGlob', () => {
    it('finds files matching a single-level wildcard pattern', () => {
      const results = expandGlob('agents/*.md', tmpDir);

      assert.ok(results.length === 3);
      assert.ok(results.includes('agents/foo-bar.md'));
      assert.ok(results.includes('agents/baz.md'));
      assert.ok(results.includes('agents/qux-thing.md'));
    });

    it('handles ** recursive patterns', () => {
      const results = expandGlob('skills/shared/**/SKILL.md', tmpDir);

      assert.ok(results.length === 2);
      assert.ok(results.includes(path.join('skills', 'shared', 'delegation', 'SKILL.md')));
      assert.ok(results.includes(path.join('skills', 'shared', 'execution', 'SKILL.md')));
    });

    it('returns sorted results', () => {
      const results = expandGlob('agents/*.md', tmpDir);

      const sorted = [...results].sort();
      assert.deepEqual(results, sorted);
    });

    it('returns empty array when no files match', () => {
      const results = expandGlob('nonexistent/*.js', tmpDir);

      assert.deepEqual(results, []);
    });

    it('does not match directories as final segment', () => {
      const results = expandGlob('skills/*', tmpDir);

      assert.deepEqual(results, []);
    });

    it('filters by extension when wildcard is scoped', () => {
      const results = expandGlob('docs/*.md', tmpDir);

      assert.ok(results.length === 1);
      assert.ok(results.includes('docs/guide.md'));
    });
  });

  describe('computeOutputPath', () => {
    it('rewrites skills/shared/ to skills/', () => {
      const result = computeOutputPath('skills/shared/delegation/SKILL.md', {
        outputDir: './',
      });

      assert.equal(result, 'skills/delegation/SKILL.md');
    });

    it('applies snake_case naming for agent files', () => {
      const result = computeOutputPath('agents/foo-bar.md', {
        agentNaming: 'snake_case',
        outputDir: './',
      });

      assert.equal(result, 'agents/foo_bar.md');
    });

    it('preserves kebab-case naming when agentNaming is not snake_case', () => {
      const result = computeOutputPath('agents/foo-bar.md', {
        agentNaming: 'kebab-case',
        outputDir: './',
      });

      assert.equal(result, 'agents/foo-bar.md');
    });

    it('prepends outputDir when present and not ./', () => {
      const result = computeOutputPath('agents/baz.md', {
        outputDir: 'claude/',
      });

      assert.equal(result, 'claude/agents/baz.md');
    });

    it('skips outputDir prepending for ./', () => {
      const result = computeOutputPath('agents/baz.md', {
        outputDir: './',
      });

      assert.equal(result, 'agents/baz.md');
    });

    it('skips outputDir prepending when outputDir is undefined', () => {
      const result = computeOutputPath('agents/baz.md', {});

      assert.equal(result, 'agents/baz.md');
    });

    it('applies both snake_case and outputDir together', () => {
      const result = computeOutputPath('agents/code-reviewer.md', {
        agentNaming: 'snake_case',
        outputDir: 'plugins/maestro/',
      });

      assert.equal(result, 'plugins/maestro/agents/code_reviewer.md');
    });

    it('does not apply snake_case to non-agent paths', () => {
      const result = computeOutputPath('skills/shared/my-skill/SKILL.md', {
        agentNaming: 'snake_case',
        outputDir: './',
      });

      assert.equal(result, 'skills/my-skill/SKILL.md');
    });
  });

  describe('assertNoMirroredSharedOutputs', () => {
    it('does not throw for valid output paths', () => {
      const manifest = [
        { outputs: { qwen: 'agents/foo.md', claude: 'claude/agents/foo.md' } },
      ];

      assert.doesNotThrow(() => assertNoMirroredSharedOutputs(manifest));
    });

    it('throws for outputs that mirror shared code', () => {
      const forbiddenOutputs = [
        ['qwen', 'mcp/maestro-server-core.js'],
        ['claude', 'claude/mcp/maestro-server-core.js'],
        ['codex', 'plugins/maestro/mcp/maestro-server-core.js'],
        ['qwen', 'lib/something.js'],
        ['claude', 'claude/lib/registry.js'],
        ['codex', 'plugins/maestro/lib/agent-registry.js'],
        ['qwen', 'lib/mcp/generated/resource-registry.js'],
      ];

      for (const [runtime, outputPath] of forbiddenOutputs) {
        assert.throws(
          () => assertNoMirroredSharedOutputs([{ outputs: { [runtime]: outputPath } }]),
          { message: `Manifest output is not allowed in src-first mode: "${outputPath}"` }
        );
      }
    });
  });

  describe('expandManifest', () => {
    const runtimes = {
      qwen: { name: 'qwen', agentNaming: 'snake_case', outputDir: './' },
      claude: { name: 'claude', agentNaming: 'kebab-case', outputDir: 'claude/' },
      codex: { name: 'codex', agentNaming: 'kebab-case', outputDir: 'plugins/maestro/' },
    };

    it('expands glob rules into per-file entries', () => {
      const rule = {
        glob: 'agents/*.md',
        transforms: ['agent-stub'],
        runtimes: ['qwen', 'claude'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result.length, 3);

      const srcs = result.map((e) => e.src).sort();
      assert.deepEqual(srcs, ['agents/baz.md', 'agents/foo-bar.md', 'agents/qux-thing.md']);

      const fooEntry = result.find((e) => e.src === 'agents/foo-bar.md');
      assert.equal(fooEntry.outputs.qwen, 'agents/foo_bar.md');
      assert.equal(fooEntry.outputs.claude, 'claude/agents/foo-bar.md');
    });

    it('expands explicit src rules', () => {
      const rule = {
        src: 'skills/shared/delegation/SKILL.md',
        transforms: ['skill-discovery-stub'],
        runtimes: ['claude', 'codex'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result.length, 1);
      assert.equal(result[0].src, 'skills/shared/delegation/SKILL.md');
      assert.equal(result[0].outputs.claude, 'claude/skills/delegation/SKILL.md');
      assert.equal(result[0].outputs.codex, 'plugins/maestro/skills/delegation/SKILL.md');
    });

    it('produces separate entries for same source with different transforms', () => {
      const rules = [
        { glob: 'agents/*.md', transforms: ['agent-stub'], runtimes: ['qwen', 'claude'] },
        { glob: 'agents/*.md', transforms: ['skill-discovery-stub'], runtimes: ['codex'] },
      ];

      const result = expandManifest(rules, runtimes, tmpDir);

      const fooEntries = result.filter((e) => e.src === 'agents/foo-bar.md');
      assert.equal(fooEntries.length, 2, 'foo-bar.md appears in both rules');

      const qwenClaudeEntry = fooEntries.find((e) => e.outputs.qwen);
      assert.deepEqual(qwenClaudeEntry.transforms, ['agent-stub']);
      assert.deepEqual(qwenClaudeEntry.outputs, {
        qwen: 'agents/foo_bar.md',
        claude: 'claude/agents/foo-bar.md',
      });

      const codexEntry = fooEntries.find((e) => e.outputs.codex);
      assert.deepEqual(codexEntry.transforms, ['skill-discovery-stub']);
      assert.deepEqual(codexEntry.outputs, { codex: 'plugins/maestro/agents/foo-bar.md' });
    });

    it('throws when rule is missing runtimes', () => {
      const rule = { glob: 'agents/*.md', transforms: ['agent-stub'] };

      assert.throws(
        () => expandManifest([rule], runtimes, tmpDir),
        /missing "runtimes"/
      );
    });

    it('throws when rule has neither glob nor src', () => {
      const rule = { transforms: ['agent-stub'], runtimes: ['qwen'] };

      assert.throws(
        () => expandManifest([rule], runtimes, tmpDir),
        /needs "glob" or "src"/
      );
    });

    it('preserves transforms array on expanded entries', () => {
      const rule = {
        glob: 'agents/*.md',
        transforms: ['agent-stub', 'skill-discovery-stub'],
        runtimes: ['qwen'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      for (const entry of result) {
        assert.deepEqual(entry.transforms, ['agent-stub', 'skill-discovery-stub']);
      }
    });

    it('applies recursive glob with runtimes correctly', () => {
      const rule = {
        glob: 'skills/shared/**/SKILL.md',
        transforms: ['skill-discovery-stub'],
        runtimes: ['claude', 'codex'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result.length, 2);

      const delegationEntry = result.find((e) => e.src.includes('delegation'));
      assert.equal(delegationEntry.outputs.claude, 'claude/skills/delegation/SKILL.md');
      assert.equal(delegationEntry.outputs.codex, 'plugins/maestro/skills/delegation/SKILL.md');
    });

    describe('against src/', () => {
      const realRuntimes = Object.fromEntries(
        RUNTIME_NAMES.map((name) => [name, getRuntimeConfig(name)])
      );

      it('expands the agents glob into one entry per agent with per-runtime outputs', () => {
        const rule = { glob: 'agents/*.md', transforms: ['agent-stub'], runtimes: ['claude', 'qwen'] };

        const result = expandManifest([rule], realRuntimes, SRC_ROOT);

        assert.equal(result.length, AGENT_COUNT);

        const coderEntries = result.filter((e) => e.src === 'agents/coder.md');
        assert.equal(coderEntries.length, 1, 'coder.md should appear once for this rule');
        assert.equal(coderEntries[0].outputs.qwen, 'agents/coder.md');
        assert.equal(coderEntries[0].outputs.claude, 'claude/agents/coder.md');
        assert.deepEqual(coderEntries[0].transforms, ['agent-stub']);

        const codeReviewerEntry = result.find((e) => e.src === 'agents/code-reviewer.md');
        assert.ok(codeReviewerEntry, 'code-reviewer.md should be in entries');
        assert.equal(codeReviewerEntry.outputs.qwen, 'agents/code_reviewer.md');
        assert.equal(codeReviewerEntry.outputs.claude, 'claude/agents/code-reviewer.md');
      });

      it('stubs agents for antigravity, claude and qwen only, with the qwen stubs in the repo-root agents/ directory', () => {
        const result = expandManifest(manifestRules, realRuntimes, SRC_ROOT);

        assert.doesNotThrow(() => assertNoMirroredSharedOutputs(result));

        const agentEntries = result.filter((e) => e.transforms.includes('agent-stub'));
        assert.equal(agentEntries.length, AGENT_COUNT);
        for (const entry of agentEntries) {
          assert.deepEqual(Object.keys(entry.outputs), ['antigravity', 'claude', 'qwen'], entry.src);
          assert.equal(entry.outputs.antigravity, `antigravity/${entry.src}`, entry.src);
          assert.equal(
            entry.outputs.qwen,
            `agents/${path.basename(entry.src, '.md').replace(/-/g, '_')}.md`,
            entry.src
          );
        }

        // Qwen Code loads an extension's subagents only from <extension>/agents/,
        // and the repo root is the Qwen extension directory.
        const outputPaths = result.flatMap((e) => Object.values(e.outputs));
        assert.deepEqual(
          outputPaths.filter((p) => p.startsWith('agents/')).sort(),
          agentEntries.map((e) => e.outputs.qwen).sort()
        );
        assert.deepEqual(outputPaths.filter((p) => p.startsWith('qwen/')), []);
      });

      it('stubs shared skills for antigravity, claude and codex only, one folder per skill', () => {
        const result = expandManifest(manifestRules, realRuntimes, SRC_ROOT);

        const skillEntries = result.filter((e) => e.transforms.includes('skill-discovery-stub'));
        assert.equal(skillEntries.length, SHARED_SKILL_COUNT);
        for (const entry of skillEntries) {
          const skillPath = entry.src.split(path.sep).join('/').replace(/^skills\/shared\//, 'skills/');
          assert.deepEqual(Object.keys(entry.outputs), ['antigravity', 'claude', 'codex'], entry.src);
          assert.equal(entry.outputs.antigravity, `antigravity/${skillPath}`, entry.src);
          assert.equal(entry.outputs.claude, `claude/${skillPath}`, entry.src);
          assert.equal(entry.outputs.codex, `plugins/maestro/${skillPath}`, entry.src);
        }
      });
    });
  });
});
