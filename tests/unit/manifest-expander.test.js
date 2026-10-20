'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { expandManifest, renderManifest } = require('../../src/generator/manifest-expander');
const manifestRules = require('../../src/generator/manifest');
const agentStub = require('../../src/generator/transforms/agent-stub');
const skillDiscoveryStub = require('../../src/generator/transforms/skill-discovery-stub');
const { RUNTIME_NAMES, getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { AGENT_COUNT, SHARED_SKILL_COUNT } = require('../support/catalog');
const { makeTempDir, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

describe('manifest-expander', () => {
  const runtimes = {
    qwen: { name: 'qwen', agentNaming: 'snake_case', outputDir: './' },
    claude: { name: 'claude', agentNaming: 'kebab-case', outputDir: 'claude/' },
    codex: { name: 'codex', agentNaming: 'kebab-case', outputDir: 'plugins/maestro/' },
  };
  let tmpDir;

  before(() => {
    tmpDir = makeTempDir('manifest-expander-');
    writeTree(tmpDir, 'agents/foo-bar.md', 'foo');
    writeTree(tmpDir, 'agents/baz.md', 'baz');
    writeTree(tmpDir, 'skills/shared/delegation/SKILL.md');
    writeTree(tmpDir, 'skills/shared/code-review/SKILL.md');
  });

  describe('expandManifest', () => {
    it('expands a glob rule into one entry per file, named per runtime under its outputDir', () => {
      const rule = { glob: 'agents/*.md', transform: agentStub, runtimes: ['qwen', 'claude'] };

      assert.deepEqual(expandManifest([rule], runtimes, tmpDir), [
        {
          src: 'agents/baz.md',
          transform: agentStub,
          outputs: { qwen: 'agents/baz.md', claude: 'claude/agents/baz.md' },
        },
        {
          src: 'agents/foo-bar.md',
          transform: agentStub,
          outputs: { qwen: 'agents/foo_bar.md', claude: 'claude/agents/foo-bar.md' },
        },
      ]);
    });

    it('flattens skills/shared/ and keeps skill paths kebab-case under a snake_case runtime', () => {
      const rule = {
        glob: 'skills/shared/**/SKILL.md',
        transform: skillDiscoveryStub,
        runtimes: ['qwen', 'claude', 'codex'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.deepEqual(result.map((e) => e.src), [
        'skills/shared/code-review/SKILL.md',
        'skills/shared/delegation/SKILL.md',
      ]);
      assert.deepEqual(result[0].outputs, {
        qwen: 'skills/code-review/SKILL.md',
        claude: 'claude/skills/code-review/SKILL.md',
        codex: 'plugins/maestro/skills/code-review/SKILL.md',
      });
    });

    describe('against src/', () => {
      const realRuntimes = Object.fromEntries(
        RUNTIME_NAMES.map((name) => [name, getRuntimeConfig(name)])
      );

      it('expands the agents glob into one entry per agent with per-runtime outputs', () => {
        const rule = { glob: 'agents/*.md', transform: agentStub, runtimes: ['claude', 'qwen'] };

        const result = expandManifest([rule], realRuntimes, SRC_ROOT);

        assert.equal(result.length, AGENT_COUNT);

        const coderEntries = result.filter((e) => e.src === 'agents/coder.md');
        assert.equal(coderEntries.length, 1, 'coder.md should appear once for this rule');
        assert.equal(coderEntries[0].outputs.qwen, 'agents/coder.md');
        assert.equal(coderEntries[0].outputs.claude, 'claude/agents/coder.md');
        assert.equal(coderEntries[0].transform, agentStub);

        const codeReviewerEntry = result.find((e) => e.src === 'agents/code-reviewer.md');
        assert.ok(codeReviewerEntry, 'code-reviewer.md should be in entries');
        assert.equal(codeReviewerEntry.outputs.qwen, 'agents/code_reviewer.md');
        assert.equal(codeReviewerEntry.outputs.claude, 'claude/agents/code-reviewer.md');
      });

      it('stubs agents for antigravity, claude and qwen only, with the qwen stubs in the repo-root agents/ directory', () => {
        const result = expandManifest(manifestRules, realRuntimes, SRC_ROOT);

        const agentEntries = result.filter((e) => e.transform === agentStub);
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

        const skillEntries = result.filter((e) => e.transform === skillDiscoveryStub);
        assert.equal(skillEntries.length, SHARED_SKILL_COUNT);
        for (const entry of skillEntries) {
          const skillPath = entry.src.replace(/^skills\/shared\//, 'skills/');
          assert.deepEqual(Object.keys(entry.outputs), ['antigravity', 'claude', 'codex'], entry.src);
          assert.equal(entry.outputs.antigravity, `antigravity/${skillPath}`, entry.src);
          assert.equal(entry.outputs.claude, `claude/${skillPath}`, entry.src);
          assert.equal(entry.outputs.codex, `plugins/maestro/${skillPath}`, entry.src);
        }
      });
    });
  });

  describe('renderManifest', () => {
    it('runs each entry transform per runtime and reports a failing one without stopping', () => {
      const transform = (content, runtime) => {
        if (runtime.name === 'claude' && content === 'foo') throw new Error('boom');
        return `${runtime.name}:${content}`;
      };
      const manifest = expandManifest(
        [{ glob: 'agents/*.md', transform, runtimes: ['qwen', 'claude'] }],
        runtimes,
        tmpDir
      );
      const reported = [];

      const outputs = [...renderManifest(manifest, runtimes, tmpDir, (message, err) => {
        reported.push(`${message}: ${err.message}`);
      })];

      assert.deepEqual(outputs, [
        { outputPath: 'agents/baz.md', content: 'qwen:baz' },
        { outputPath: 'claude/agents/baz.md', content: 'claude:baz' },
        { outputPath: 'agents/foo_bar.md', content: 'qwen:foo' },
      ]);
      assert.deepEqual(reported, ['processing agents/foo-bar.md -> claude/agents/foo-bar.md: boom']);
    });
  });
});
