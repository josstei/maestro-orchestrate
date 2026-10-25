'use strict';

const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { editJson, makeTempDir, removeDir } = require('../support/fs');
const { ISOLATED_GIT_ENV } = require('../support/env');
const { createTempRepoCopy, withTempRepoCopy } = require('./helpers');
const { spawnMcpServer } = require('./mcp-stdio-client');
const { packageReleaseArtifacts } = require('../../scripts/package-release-artifacts');
const { verifyReleaseArtifact } = require('../../scripts/verify-release-artifacts');
const { buildDependencyGraph } = require('../../src/generator/dependency-graph');

/**
 * Extracts `archivePath` into a scratch directory, lets `mutate` edit the
 * extracted tree, repacks it as `name` in that scratch directory and passes
 * the repacked archive path to `fn`. The scratch directory is removed
 * afterwards; the source archive is never modified.
 *
 * @template T
 * @param {string} archivePath - Archive to extract
 * @param {string} name - File name for the repacked archive
 * @param {(extractRoot: string) => void} mutate - Edits the extracted tree
 * @param {(repackedPath: string) => T} fn - Synchronous callback receiving the repacked archive path
 * @returns {T} The callback's result
 */
function withRepackedArchive(archivePath, name, mutate, fn) {
  const workRoot = makeTempDir('maestro-release-repack-');
  const extractRoot = path.join(workRoot, 'extract');
  const repackedPath = path.join(workRoot, name);

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
        'platforms/antigravity/policy-enforcer.js',
        'platforms/claude/policy-enforcer.js',
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
    const env = {
      ...process.env, ...ISOLATED_GIT_ENV,
      NODE_PATH: '',
      PWD: workspace,
      INIT_CWD: undefined,
      CLAUDE_PROJECT_DIR: workspace,
      MAESTRO_WORKSPACE_PATH: workspace,
      MAESTRO_EXTENSION_PATH: extractedRoot,
      MAESTRO_STATE_DIR: 'archive-state',
      MAESTRO_EXECUTION_MODE: 'parallel',
    };
    try {
      for (const runtime of ['antigravity', 'claude', 'codex', 'qwen']) {
        const client = spawnMcpServer({
          cwd: workspace,
          relativePath: path.join(extractedRoot, 'mcp/maestro-server.js'),
          env: { ...env, MAESTRO_RUNTIME: runtime },
          requestTimeoutMs: 5000,
        });
        try {
          await client.ready;
          await client.initialize();
          const result = await client.callTool('get_runtime_context');
          assert.notEqual(result.raw.isError, true, JSON.stringify(result.parsed));
          assert.equal(result.parsed.runtime, runtime);
        } finally {
          await client.close();
        }
      }
      const run = (script, args = [], input = '') => execFileSync(process.execPath,
        [path.join(extractedRoot, 'src/scripts', script), ...args], {
          cwd: workspace, env, input, encoding: 'utf8',
        });
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

  it('rejects archives with a missing launcher or a directory in its place', () => {
    const launcher = 'mcp/maestro-server.js';
    for (const replaceWithDirectory of [false, true]) {
      withRepackedArchive(packaged.archivePath, 'maestro-missing-launcher.tar.gz', (extractRoot) => {
        const target = path.join(extractRoot, launcher);
        fs.rmSync(target);
        if (replaceWithDirectory) fs.mkdirSync(target);
      }, (archivePath) => {
        assert.throws(() => verifyReleaseArtifact(archivePath, { root: repoRoot }), {
          message: replaceWithDirectory
            ? `Required runtime file must be a regular file: ${launcher}`
            : `Required runtime file missing: ${launcher}`,
        });
      });
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

  it('rejects an archive with manifest version drift', () => {
    for (const manifestPath of ['qwen-extension.json', 'antigravity/plugin.json']) {
      withRepackedArchive(
        packaged.archivePath,
        'maestro-corrupt-extension.tar.gz',
        (extractRoot) => {
          editJson(path.join(extractRoot, manifestPath), (manifest) => {
            manifest.version = '0.0.0';
          });
        },
        (corruptArchivePath) => {
          assert.throws(
            () => verifyReleaseArtifact(corruptArchivePath, { root: repoRoot }),
            { message: `Release manifest version mismatch; expected ${packaged.version}: ${manifestPath}=0.0.0` }
          );
        }
      );
    }
  });

  it('rejects an archive with extra unallowlisted files', () => {
    withRepackedArchive(
      packaged.archivePath,
      'maestro-extra-extension.tar.gz',
      (extractRoot) => {
        fs.writeFileSync(path.join(extractRoot, 'unexpected-local-file.txt'), 'secret\n');
      },
      (extraArchivePath) => {
        assert.throws(
          () => verifyReleaseArtifact(extraArchivePath, { root: repoRoot }),
          /Release artifact contains unallowlisted paths: unexpected-local-file\.txt/
        );
      }
    );
  });

  it('rejects build sources reintroduced into an otherwise valid archive', () => {
    for (const buildPath of [
      'src/generator/dependency-graph.js',
      'src/entry-points/templates/qwen-command.toml.tmpl',
      'src/generator/stub-outputs.js',
    ]) {
      withRepackedArchive(packaged.archivePath, 'maestro-build-source.tar.gz', (extractRoot) => {
        const target = path.join(extractRoot, buildPath);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, 'unexpected build source\n');
      }, (archivePath) => {
        assert.throws(() => verifyReleaseArtifact(archivePath, { root: repoRoot }), (error) => {
          assert.match(error.message, /Release artifact contains unallowlisted paths:/);
          assert.ok(error.message.includes(buildPath), error.message);
          return true;
        });
      });
    }
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
    withRepackedArchive(packaged.archivePath, 'nested-cache.tar.gz', (root) => {
      const target = path.join(root, forbidden[1]);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, 'fixture only\n');
    }, (archivePath) => {
      assert.throws(() => verifyReleaseArtifact(archivePath), /Release artifact contains denied paths:/);
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

  it('rejects a repacked archive containing a dangling served-resource symlink', () => {
    withRepackedArchive(packaged.archivePath, 'linked-resource.tar.gz', (root) => {
      const resource = path.join(root, 'src/references/architecture.md');
      fs.unlinkSync(resource);
      fs.symlinkSync(path.join(root, 'missing-resource.md'), resource, 'file');
    }, (archivePath) => {
      assert.throws(() => verifyReleaseArtifact(archivePath),
        /Release artifact contains symbolic link: src\/references\/architecture.md/);
    });
  });
});
