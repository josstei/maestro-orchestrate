'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { editJson, makeTempDir, removeDir, writeTree } = require('../support/fs');
const { hermeticEnv } = require('../support/env');
const { runNodeOk } = require('../support/process');
const { createTempRepoCopy, withTempRepoCopy } = require('./helpers');
const { withMcpClient } = require('./mcp-stdio-client');
const { packageReleaseArtifacts } = require('../../scripts/package-release-artifacts');
const { verifyReleaseArtifact } = require('../../scripts/verify-release-artifacts');
const { buildDependencyGraph } = require('../../src/generator/dependency-graph');

/**
 * Extracts `archivePath` into a scratch directory, lets `mutate` edit the
 * extracted tree, repacks it in that scratch directory and passes the
 * repacked archive path to `fn`. The scratch directory is removed
 * afterwards; the source archive is never modified.
 *
 * @template T
 * @param {string} archivePath - Archive to extract
 * @param {(extractRoot: string) => void} mutate - Edits the extracted tree
 * @param {(repackedPath: string) => T} fn - Synchronous callback receiving the repacked archive path
 * @returns {T} The callback's result
 */
function withRepackedArchive(archivePath, mutate, fn) {
  const workRoot = makeTempDir('maestro-release-repack-');
  const extractRoot = path.join(workRoot, 'extract');
  const repackedPath = path.join(workRoot, 'repacked.tar.gz');

  try {
    fs.mkdirSync(extractRoot);
    execFileSync('tar', ['-xzf', archivePath, '-C', extractRoot]);
    mutate(extractRoot);
    execFileSync('tar', ['-czf', repackedPath, '-C', extractRoot, '.']);
    return fn(repackedPath);
  } finally {
    removeDir(workRoot);
  }
}

describe('release artifact packaging', () => {
  // One repo copy and one packaged archive shared by the read-only tests;
  // corrupted variants are repacked elsewhere so neither is ever modified.
  let repoRoot = null;
  let packaged = null;
  let extractedRoot = null;

  before(() => {
    repoRoot = createTempRepoCopy('maestro-release-artifact-');
    packaged = packageReleaseArtifacts({ root: repoRoot, outDir: 'dist/release' });
    extractedRoot = path.join(path.dirname(repoRoot), 'extracted');
    fs.mkdirSync(extractedRoot);
    execFileSync('tar', ['-xzf', packaged.archivePath, '-C', extractedRoot]);
  });

  after(() => {
    if (repoRoot) {
      removeDir(path.dirname(repoRoot));
    }
  });

  it('builds and verifies a self-contained release archive from a repo copy', () => {
    const { archivePath, version } = packaged;
    const result = verifyReleaseArtifact(archivePath, { root: repoRoot });

    assert.equal(result.version, version);
    assert.equal(fs.existsSync(archivePath), true);
    assert.match(path.basename(archivePath), /^maestro-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?-extension\.tar\.gz$/);

    const archiveEntries = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
      .trim()
      .split('\n');
    assert.equal(archiveEntries.includes('./claude/scripts/policy-enforcer.test.js'), false);
    for (const entry of [
      './antigravity/plugin.json',
      './antigravity/mcp_config.json',
      './antigravity/hooks.json',
      './antigravity/src/version.json',
      './docs/runtime-antigravity.md',
    ]) {
      assert.ok(archiveEntries.includes(entry), `Expected the archive to include ${entry}`);
    }
    for (const buildPath of [
      'src/entry-points', 'src/generator', 'src/transforms',
      'src/platforms/metadata.js', 'src/platforms/qwen/policy-pack.js',
      'src/lib/discovery', 'src/lib/yaml-emit.js',
    ]) {
      assert.equal(fs.existsSync(path.join(extractedRoot, buildPath)), false, buildPath);
    }
  });

  it('retains the complete canonical runtime dependency graph without build dependencies', () => {
    assert.equal(fs.existsSync(path.join(extractedRoot, 'node_modules')), false);
    // Parse with the checkout's build tooling; no parser is shipped or loaded
    // by the extracted runtime. Roots are independent of packaging policy.
    const graph = buildDependencyGraph({
      rootDir: path.join(extractedRoot, 'src'),
      roots: [
        'mcp/maestro-server.js',
        'platforms/shared/hook-runner.js',
        'platforms/shared/policy-enforcer.js',
        'platforms/antigravity/runtime-config.js',
        'platforms/claude/runtime-config.js',
        'platforms/codex/runtime-config.js',
        'platforms/qwen/runtime-config.js',
        'scripts/ensure-workspace.js',
        'scripts/read-active-session.js',
        'scripts/read-setting.js',
        'scripts/read-state.js',
        'scripts/write-state.js',
      ],
    });
    assert.deepEqual(graph.issues, []);
  });

  it('runs MCP for all four runtimes and all five state CLIs from the extracted archive', async () => {
    const workspace = makeTempDir('maestro-release-workspace-');
    const env = hermeticEnv(workspace, {
      CLAUDE_PROJECT_DIR: workspace,
      MAESTRO_WORKSPACE_PATH: workspace,
      MAESTRO_EXTENSION_PATH: extractedRoot,
      MAESTRO_STATE_DIR: 'archive-state',
      MAESTRO_EXECUTION_MODE: 'parallel',
    });
    try {
      for (const runtime of ['antigravity', 'claude', 'codex', 'qwen']) {
        await withMcpClient({
          cwd: workspace,
          relativePath: path.join(extractedRoot, 'mcp/maestro-server.js'),
          env: { ...env, MAESTRO_RUNTIME: runtime },
          requestTimeoutMs: 5000,
        }, async (client) => {
          const result = await client.callTool('get_runtime_context');
          assert.notEqual(result.raw.isError, true, JSON.stringify(result.parsed));
          assert.equal(result.parsed.runtime, runtime);
        });
      }
      const run = (script, args = [], input = '') =>
        runNodeOk(path.join(extractedRoot, 'src/scripts', script), args, { cwd: workspace, env, input });
      run('ensure-workspace.js', ['archive-state']);
      assert.equal(run('read-setting.js', ['MAESTRO_EXECUTION_MODE']), 'parallel');
      assert.equal(run('read-active-session.js'), 'No active session\n');
      const content = '---\n{"session_id":"archive","status":"in_progress"}\n---\n';
      run('write-state.js', ['archive-state/state/active-session.md'], content);
      assert.equal(run('read-state.js', ['archive-state/state/active-session.md']), content);
      assert.equal(run('read-active-session.js'), content);
    } finally {
      removeDir(workspace);
    }
  });

  it('fails packaging before writing an archive when a public launcher is missing', () => {
    withTempRepoCopy('maestro-release-missing-launcher-', (missingRoot) => {
      fs.rmSync(path.join(missingRoot, 'claude/scripts/hook-runner.js'));
      assert.throws(() => packageReleaseArtifacts({ root: missingRoot, outDir: 'dist/release' }), {
        message: 'Required runtime file missing: claude/scripts/hook-runner.js',
      });
      assert.equal(fs.existsSync(path.join(missingRoot, 'dist/release')), false);
    });
  });

  it('fails packaging when a required runtime surface is missing', () => {
    withTempRepoCopy('maestro-release-missing-', (missingRoot) => {
      fs.rmSync(path.join(missingRoot, 'qwen-extension.json'));

      assert.throws(
        () => packageReleaseArtifacts({ root: missingRoot, outDir: 'dist/release' }),
        /Required release artifact paths are missing: qwen-extension\.json/
      );
    });
  });

  it('excludes nested tests, caches and scratch files from packaged archives', () => {
    const forbidden = ['claude/tests/fixtures/helper.js', 'antigravity/.cache/probe.json', 'src/tmp/probe.txt'];
    withTempRepoCopy('maestro-release-nested-', (root) => {
      for (const file of forbidden) {
        const target = path.join(root, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'fixture only\n');
      }
      const { archivePath } = packageReleaseArtifacts({ root, outDir: 'dist/release' });
      const entries = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' }).trim().split('\n');
      for (const file of forbidden) assert.equal(entries.includes(`./${file}`), false, file);
      assert.equal(verifyReleaseArtifact(archivePath).version, packaged.version);
    });
  });

  it('rejects source symlinks and allowlisted-file ancestor symlinks before creating an archive', () => {
    withTempRepoCopy('maestro-release-symlink-', (root) => {
      const resource = path.join(root, 'src/references/architecture.md');
      const original = fs.readFileSync(resource);
      const external = path.join(path.dirname(root), 'outside.md');
      fs.writeFileSync(external, 'external fixture\n');
      for (const target of [external, external + '.missing', path.join(root, 'src/references/orchestration-steps.md')]) {
        fs.unlinkSync(resource);
        fs.symlinkSync(target, resource, 'file');
        assert.throws(() => packageReleaseArtifacts({ root, outDir: 'dist/release' }),
          /Release artifact contains symbolic link: src\/references\/architecture.md/);
        assert.equal(fs.existsSync(path.join(root, 'dist/release')), false);
        fs.unlinkSync(resource);
        fs.writeFileSync(resource, original);
      }
      const docs = path.join(root, 'docs');
      const savedDocs = path.join(path.dirname(root), 'external-docs');
      fs.renameSync(docs, savedDocs);
      fs.symlinkSync(savedDocs, docs, 'dir');
      assert.throws(() => packageReleaseArtifacts({ root, outDir: 'dist/release' }),
        /Release artifact contains symbolic link: docs/);
      assert.equal(fs.existsSync(path.join(root, 'dist/release')), false);
    });
  });

  // Each corruption must reach verifyReleaseArtifact's content and manifest
  // checks on a real archive; release-artifact-manifest.test.js covers each
  // check's rules.
  for (const [name, mutate, expected] of [
    [
      'a missing launcher',
      (root) => fs.rmSync(path.join(root, 'mcp/maestro-server.js')),
      { message: 'Required runtime file missing: mcp/maestro-server.js' },
    ],
    [
      'manifest version drift',
      (root) => editJson(path.join(root, 'qwen-extension.json'), (manifest) => { manifest.version = '0.0.0'; }),
      // A function, because `packaged` is only assigned in before().
      (error) => {
        assert.equal(error.message, `Release manifest version mismatch; expected ${packaged.version}: qwen-extension.json=0.0.0`);
        return true;
      },
    ],
    [
      'a reintroduced build source',
      (root) => writeTree(root, 'src/generator/dependency-graph.js', 'unexpected build source\n'),
      (error) => {
        assert.match(error.message, /Release artifact contains unallowlisted paths:/);
        assert.ok(error.message.includes('src/generator/dependency-graph.js'), error.message);
        return true;
      },
    ],
    [
      'a nested cache file',
      (root) => writeTree(root, 'antigravity/.cache/probe.json', 'fixture only\n'),
      /Release artifact contains denied paths:/,
    ],
    [
      'a dangling served-resource symlink',
      (root) => {
        const resource = path.join(root, 'src/references/architecture.md');
        fs.unlinkSync(resource);
        fs.symlinkSync(path.join(root, 'missing-resource.md'), resource, 'file');
      },
      /Release artifact contains symbolic link: src\/references\/architecture.md/,
    ],
  ]) {
    it(`rejects a repacked archive with ${name}`, () => {
      withRepackedArchive(packaged.archivePath, mutate, (archivePath) => {
        assert.throws(() => verifyReleaseArtifact(archivePath, { root: repoRoot }), expected);
      });
    });
  }
});
