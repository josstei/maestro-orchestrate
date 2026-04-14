'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  expandGlob,
  computeOutputPath,
  normalizeOutputBase,
  joinRelativePath,
  buildRuntimeOutputPath,
  assertNoMirroredSharedOutputs,
  expandManifest,
} = require('../../src/generator/manifest-expander');

describe('manifest-expander', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-expander-'));

    fs.mkdirSync(path.join(tmpDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'agents', 'foo-bar.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'agents', 'baz.md'), '');
    fs.writeFileSync(path.join(tmpDir, 'agents', 'qux-thing.md'), '');

    fs.mkdirSync(path.join(tmpDir, 'skills', 'shared', 'delegation'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skills', 'shared', 'delegation', 'SKILL.md'), '');

    fs.mkdirSync(path.join(tmpDir, 'skills', 'shared', 'execution'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'skills', 'shared', 'execution', 'SKILL.md'), '');

    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'docs', 'readme.txt'), '');
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guide.md'), '');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
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
      assert.deepStrictEqual(results, sorted);
    });

    it('returns empty array when no files match', () => {
      const results = expandGlob('nonexistent/*.js', tmpDir);

      assert.deepStrictEqual(results, []);
    });

    it('does not match directories as final segment', () => {
      const results = expandGlob('skills/*', tmpDir);

      assert.deepStrictEqual(results, []);
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

  describe('normalizeOutputBase', () => {
    it('returns empty string for null input', () => {
      assert.equal(normalizeOutputBase(null, 'claude'), '');
    });

    it('returns empty string for undefined input', () => {
      assert.equal(normalizeOutputBase(undefined, 'claude'), '');
    });

    it('returns the string directly for string input', () => {
      assert.equal(normalizeOutputBase('custom/base', 'claude'), 'custom/base');
    });

    it('returns runtime-specific value from object input', () => {
      const outputBase = { claude: 'claude-base', gemini: 'gemini-base' };

      assert.equal(normalizeOutputBase(outputBase, 'claude'), 'claude-base');
      assert.equal(normalizeOutputBase(outputBase, 'gemini'), 'gemini-base');
    });

    it('returns empty string for missing runtime key in object input', () => {
      const outputBase = { claude: 'claude-base' };

      assert.equal(normalizeOutputBase(outputBase, 'codex'), '');
    });

    it('throws for invalid outputBase types', () => {
      assert.throws(
        () => normalizeOutputBase(42, 'claude'),
        /Invalid outputBase/
      );
    });
  });

  describe('joinRelativePath', () => {
    it('returns relativePath unchanged when base is empty', () => {
      assert.equal(joinRelativePath('', 'agents/foo.md'), 'agents/foo.md');
    });

    it('joins base and relativePath with posix separator', () => {
      assert.equal(joinRelativePath('custom', 'agents/foo.md'), 'custom/agents/foo.md');
    });

    it('normalizes redundant separators', () => {
      assert.equal(joinRelativePath('base/', 'sub/file.md'), 'base/sub/file.md');
    });
  });

  describe('buildRuntimeOutputPath', () => {
    it('prepends outputDir to relativePath', () => {
      assert.equal(
        buildRuntimeOutputPath({ outputDir: 'claude/' }, 'agents/foo.md'),
        'claude/agents/foo.md'
      );
    });

    it('returns relativePath unchanged when outputDir is ./', () => {
      assert.equal(
        buildRuntimeOutputPath({ outputDir: './' }, 'agents/foo.md'),
        'agents/foo.md'
      );
    });

    it('returns relativePath unchanged when outputDir is absent', () => {
      assert.equal(
        buildRuntimeOutputPath({}, 'agents/foo.md'),
        'agents/foo.md'
      );
    });
  });

  describe('assertNoMirroredSharedOutputs', () => {
    it('does not throw for valid output paths', () => {
      const manifest = [
        { outputs: { gemini: 'agents/foo.md', claude: 'claude/agents/foo.md' } },
      ];

      assert.doesNotThrow(() => assertNoMirroredSharedOutputs(manifest));
    });

    it('throws for mcp/maestro-server-core.js', () => {
      const manifest = [
        { outputs: { gemini: 'mcp/maestro-server-core.js' } },
      ];

      assert.throws(
        () => assertNoMirroredSharedOutputs(manifest),
        /not allowed in src-first mode/
      );
    });

    it('throws for claude/mcp/maestro-server-core.js', () => {
      const manifest = [
        { outputs: { claude: 'claude/mcp/maestro-server-core.js' } },
      ];

      assert.throws(
        () => assertNoMirroredSharedOutputs(manifest),
        /not allowed in src-first mode/
      );
    });

    it('throws for paths starting with lib/', () => {
      const manifest = [
        { outputs: { gemini: 'lib/something.js' } },
      ];

      assert.throws(
        () => assertNoMirroredSharedOutputs(manifest),
        /not allowed in src-first mode/
      );
    });

    it('throws for paths starting with claude/lib/', () => {
      const manifest = [
        { outputs: { claude: 'claude/lib/registry.js' } },
      ];

      assert.throws(
        () => assertNoMirroredSharedOutputs(manifest),
        /not allowed in src-first mode/
      );
    });

    it('throws for paths starting with plugins/maestro/lib/', () => {
      const manifest = [
        { outputs: { codex: 'plugins/maestro/lib/agent-registry.js' } },
      ];

      assert.throws(
        () => assertNoMirroredSharedOutputs(manifest),
        /not allowed in src-first mode/
      );
    });

    it('throws for plugins/maestro/mcp/maestro-server-core.js', () => {
      const manifest = [
        { outputs: { codex: 'plugins/maestro/mcp/maestro-server-core.js' } },
      ];

      assert.throws(
        () => assertNoMirroredSharedOutputs(manifest),
        /not allowed in src-first mode/
      );
    });

    it('throws for lib/mcp/generated/resource-registry.js', () => {
      const manifest = [
        { outputs: { gemini: 'lib/mcp/generated/resource-registry.js' } },
      ];

      assert.throws(
        () => assertNoMirroredSharedOutputs(manifest),
        /not allowed in src-first mode/
      );
    });
  });

  describe('expandManifest', () => {
    const runtimes = {
      gemini: { name: 'gemini', agentNaming: 'snake_case', outputDir: './' },
      claude: { name: 'claude', agentNaming: 'kebab-case', outputDir: 'claude/' },
      codex: { name: 'codex', agentNaming: 'kebab-case', outputDir: 'plugins/maestro/' },
    };

    it('passes through legacy rules with outputs field', () => {
      const legacy = {
        src: 'some/file.md',
        transforms: ['copy'],
        outputs: { gemini: 'out/file.md' },
      };

      const result = expandManifest([legacy], runtimes, tmpDir);

      assert.equal(result.length, 1);
      assert.deepStrictEqual(result[0], legacy);
    });

    it('expands glob rules into per-file entries', () => {
      const rule = {
        glob: 'agents/*.md',
        transforms: ['inject-frontmatter'],
        runtimes: ['gemini', 'claude'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result.length, 3);

      const srcs = result.map((e) => e.src).sort();
      assert.deepStrictEqual(srcs, ['agents/baz.md', 'agents/foo-bar.md', 'agents/qux-thing.md']);

      const fooEntry = result.find((e) => e.src === 'agents/foo-bar.md');
      assert.equal(fooEntry.outputs.gemini, 'agents/foo_bar.md');
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

    it('respects exclude list on glob rules', () => {
      const rule = {
        glob: 'agents/*.md',
        transforms: ['copy'],
        runtimes: ['gemini'],
        exclude: ['agents/baz.md'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result.length, 2);
      const srcs = result.map((e) => e.src);
      assert.ok(!srcs.includes('agents/baz.md'));
    });

    it('applies outputName when specified', () => {
      const rule = {
        src: 'some/source.md',
        transforms: ['copy'],
        runtimes: ['claude'],
        outputName: 'custom-output.md',
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result[0].outputs.claude, 'claude/custom-output.md');
    });

    it('preserves source path when preserveSourcePath is set', () => {
      const rule = {
        src: 'agents/foo-bar.md',
        transforms: ['copy'],
        runtimes: ['gemini'],
        preserveSourcePath: true,
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result[0].outputs.gemini, 'agents/foo-bar.md');
    });

    it('applies outputBase from object per runtime', () => {
      const rule = {
        src: 'agents/baz.md',
        transforms: ['copy'],
        runtimes: ['gemini', 'claude'],
        preserveSourcePath: true,
        outputBase: { gemini: 'custom', claude: 'other' },
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      assert.equal(result[0].outputs.gemini, 'custom/agents/baz.md');
      assert.equal(result[0].outputs.claude, 'claude/other/agents/baz.md');
    });

    it('throws when rule is missing runtimes', () => {
      const rule = { glob: 'agents/*.md', transforms: ['copy'] };

      assert.throws(
        () => expandManifest([rule], runtimes, tmpDir),
        /missing "runtimes"/
      );
    });

    it('throws when rule has neither glob nor src', () => {
      const rule = { transforms: ['copy'], runtimes: ['gemini'] };

      assert.throws(
        () => expandManifest([rule], runtimes, tmpDir),
        /needs "glob" or "src"/
      );
    });

    it('preserves transforms array on expanded entries', () => {
      const rule = {
        glob: 'agents/*.md',
        transforms: ['inject-frontmatter', 'agent-stub'],
        runtimes: ['gemini'],
      };

      const result = expandManifest([rule], runtimes, tmpDir);

      for (const entry of result) {
        assert.deepStrictEqual(entry.transforms, ['inject-frontmatter', 'agent-stub']);
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
  });
});
