import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

import {
  expandGlob,
  computeOutputPath,
  buildRuntimeOutputPath,
  assertNoMirroredSharedOutputs,
  expandManifest,
} from '../../dist/src/generator/manifest-expander.js';

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
    const cases = [
      [
        'rewrites skills/shared/ to skills/',
        'skills/shared/delegation/SKILL.md',
        { outputDir: './' },
        'skills/delegation/SKILL.md',
      ],
      [
        'applies snake_case naming for agent files',
        'agents/foo-bar.md',
        { agentNaming: 'snake_case', outputDir: './' },
        'agents/foo_bar.md',
      ],
      [
        'preserves kebab-case naming when agentNaming is not snake_case',
        'agents/foo-bar.md',
        { agentNaming: 'kebab-case', outputDir: './' },
        'agents/foo-bar.md',
      ],
      [
        'prepends outputDir when present and not ./',
        'agents/baz.md',
        { outputDir: 'claude/' },
        'claude/agents/baz.md',
      ],
      [
        'skips outputDir prepending for ./',
        'agents/baz.md',
        { outputDir: './' },
        'agents/baz.md',
      ],
      [
        'skips outputDir prepending when outputDir is undefined',
        'agents/baz.md',
        {},
        'agents/baz.md',
      ],
      [
        'applies both snake_case and outputDir together',
        'agents/code-reviewer.md',
        { agentNaming: 'snake_case', outputDir: 'plugins/maestro/' },
        'plugins/maestro/agents/code_reviewer.md',
      ],
      [
        'does not apply snake_case to non-agent paths',
        'skills/shared/my-skill/SKILL.md',
        { agentNaming: 'snake_case', outputDir: './' },
        'skills/my-skill/SKILL.md',
      ],
    ];

    for (const [name, input, options, expected] of cases) {
      it(name, () => {
        const result = computeOutputPath(input, options);

        assert.equal(result, expected);
      });
    }
  });

  describe('buildRuntimeOutputPath', () => {
    const cases = [
      ['prepends outputDir to relativePath', { outputDir: 'claude/' }, 'agents/foo.md', 'claude/agents/foo.md'],
      ['returns relativePath unchanged when outputDir is ./', { outputDir: './' }, 'agents/foo.md', 'agents/foo.md'],
      ['returns relativePath unchanged when outputDir is absent', {}, 'agents/foo.md', 'agents/foo.md'],
    ];

    for (const [name, config, relativePath, expected] of cases) {
      it(name, () => {
        assert.equal(buildRuntimeOutputPath(config, relativePath), expected);
      });
    }
  });

  describe('assertNoMirroredSharedOutputs', () => {
    it('does not throw for valid output paths', () => {
      const manifest = [
        { outputs: { gemini: 'agents/foo.md', claude: 'claude/agents/foo.md' } },
      ];

      assert.doesNotThrow(() => assertNoMirroredSharedOutputs(manifest));
    });

    const FORBIDDEN_OUTPUT_CASES = [
      ['throws for mcp/maestro-server-core.js', 'gemini', 'mcp/maestro-server-core.js'],
      ['throws for claude/mcp/maestro-server-core.js', 'claude', 'claude/mcp/maestro-server-core.js'],
      ['throws for paths starting with lib/', 'gemini', 'lib/something.js'],
      ['throws for paths starting with claude/lib/', 'claude', 'claude/lib/registry.js'],
      ['throws for paths starting with plugins/maestro/lib/', 'codex', 'plugins/maestro/lib/agent-registry.js'],
      ['throws for plugins/maestro/mcp/maestro-server-core.js', 'codex', 'plugins/maestro/mcp/maestro-server-core.js'],
      ['throws for lib/mcp/generated/resource-registry.js', 'gemini', 'lib/mcp/generated/resource-registry.js'],
    ];

    for (const [name, runtime, outputPath] of FORBIDDEN_OUTPUT_CASES) {
      it(name, () => {
        const manifest = [{ outputs: { [runtime]: outputPath } }];

        assert.throws(
          () => assertNoMirroredSharedOutputs(manifest),
          /not allowed in src-first mode/
        );
      });
    }
  });

  describe('expandManifest', () => {
    const runtimes = {
      gemini: { name: 'gemini', agentNaming: 'snake_case', outputDir: './' },
      claude: { name: 'claude', agentNaming: 'kebab-case', outputDir: 'claude/' },
      codex: { name: 'codex', agentNaming: 'kebab-case', outputDir: 'plugins/maestro/' },
    };

    it('rejects legacy output rules', () => {
      const legacy = {
        src: 'some/file.md',
        transforms: ['copy'],
        outputs: { gemini: 'out/file.md' },
      };

      assert.throws(
        () => expandManifest([legacy], runtimes, tmpDir),
        /Manifest legacy outputs rules are not supported/
      );
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

    it('rejects retired preserveSourcePath rules', () => {
      const rule = {
        src: 'agents/foo-bar.md',
        transforms: ['copy'],
        runtimes: ['gemini'],
        preserveSourcePath: true,
      };

      assert.throws(
        () => expandManifest([rule], runtimes, tmpDir),
        /retired mirrored-output option/
      );
    });

    it('rejects retired outputBase rules', () => {
      const rule = {
        src: 'agents/baz.md',
        transforms: ['copy'],
        runtimes: ['gemini', 'claude'],
        outputBase: { gemini: 'custom', claude: 'other' },
      };

      assert.throws(
        () => expandManifest([rule], runtimes, tmpDir),
        /retired mirrored-output option/
      );
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
