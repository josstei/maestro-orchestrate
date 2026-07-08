import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectManifestPaths } from '../../dist/src/generator/manifest-curator.js';

describe('collectManifestPaths', () => {
  it('returns an empty set when manifest, runtimes, and expanders are all empty', async () => {
    const paths = await collectManifestPaths([], {}, '/src', []);
    assert.ok(paths instanceof Set);
    assert.equal(paths.size, 0);
  });

  it('collects output paths from every manifest entry', async () => {
    const manifest = [
      { outputs: { gemini: 'out/gemini/a.md', claude: 'out/claude/a.md' } },
      { outputs: { codex: 'out/codex/b.md' } },
    ];
    const paths = await collectManifestPaths(manifest, {}, '/src', []);
    assert.deepEqual(
      [...paths].sort(),
      ['out/claude/a.md', 'out/codex/b.md', 'out/gemini/a.md']
    );
  });

  it('deduplicates identical output paths across entries', async () => {
    const manifest = [
      { outputs: { a: 'out/dup.md' } },
      { outputs: { b: 'out/dup.md' } },
    ];
    const paths = await collectManifestPaths(manifest, {}, '/src', []);
    assert.deepEqual([...paths], ['out/dup.md']);
  });

  it('invokes each expander once per runtime and collects outputPath', async () => {
    const calls = [];
    const expander = (runtime, srcDir, codeSrcDir) => {
      calls.push({ runtime, srcDir, codeSrcDir });
      return [{ outputPath: `out/${runtime}/ep.md` }];
    };
    const paths = await collectManifestPaths(
      [],
      { gemini: {}, claude: {} },
      '/src',
      [expander],
      '/dist/src'
    );
    assert.deepEqual(calls.map((c) => c.runtime).sort(), ['claude', 'gemini']);
    assert.ok(calls.every((c) => c.srcDir === '/src'));
    assert.ok(calls.every((c) => c.codeSrcDir === '/dist/src'));
    assert.deepEqual(
      [...paths].sort(),
      ['out/claude/ep.md', 'out/gemini/ep.md']
    );
  });

  it('merges manifest outputs with expander outputs into a single set', async () => {
    const manifest = [{ outputs: { gemini: 'out/gemini/from-manifest.md' } }];
    const expander = (runtime) => [{ outputPath: `out/${runtime}/from-expander.md` }];
    const paths = await collectManifestPaths(
      manifest,
      { gemini: {} },
      '/src',
      [expander]
    );
    assert.deepEqual(
      [...paths].sort(),
      ['out/gemini/from-expander.md', 'out/gemini/from-manifest.md']
    );
  });

  it('runs multiple expanders and combines their results', async () => {
    const expander1 = () => [{ outputPath: 'a.md' }];
    const expander2 = () => [{ outputPath: 'b.md' }, { outputPath: 'c.md' }];
    const paths = await collectManifestPaths(
      [],
      { gemini: {} },
      '/src',
      [expander1, expander2]
    );
    assert.deepEqual([...paths].sort(), ['a.md', 'b.md', 'c.md']);
  });

  it('handles expanders that return an empty array', async () => {
    const expander = () => [];
    const paths = await collectManifestPaths([], { gemini: {} }, '/src', [expander]);
    assert.equal(paths.size, 0);
  });

  it('propagates exceptions thrown by an expander', async () => {
    const expander = () => {
      throw new Error('expander exploded');
    };
    await assert.rejects(
      () => collectManifestPaths([], { gemini: {} }, '/src', [expander]),
      /expander exploded/
    );
  });
});
