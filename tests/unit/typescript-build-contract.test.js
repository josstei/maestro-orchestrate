import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTrackedCandidateRepoCopy } from '../support/filesystem.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');

function cleanupTempRepo(repoRoot) {
  fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
}

describe('TypeScript build and generation contract', () => {
  it('bootstraps compiled and runtime outputs from a tracked-only checkout', async () => {
    const repoRoot = createTrackedCandidateRepoCopy({
      dependencyRoot: path.join(ROOT, 'node_modules'),
    });

    try {
      const tempRepoPath = (...parts) => path.join(repoRoot, ...parts);

      assert.equal(fs.existsSync(tempRepoPath('dist', 'src')), false);
      assert.equal(fs.existsSync(tempRepoPath('src', 'generated')), false);
      assert.equal(fs.existsSync(tempRepoPath('src', 'agents')), false);
      assert.equal(fs.existsSync(tempRepoPath('docs', 'maestro')), false);
      assert.equal(fs.lstatSync(tempRepoPath('node_modules')).isSymbolicLink(), true);
      assert.equal(path.relative(repoRoot, fs.realpathSync(tempRepoPath('node_modules'))).startsWith('..'), true);
      execFileSync('git', ['init', '-b', 'main'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.equal(
        execFileSync('git', ['check-ignore', '--no-index', 'dist/src/bin/maestro-mcp-server.js'], {
          cwd: repoRoot,
          encoding: 'utf8',
        }).trim(),
        'dist/src/bin/maestro-mcp-server.js'
      );

      fs.mkdirSync(tempRepoPath('dist', 'release'), { recursive: true });
      fs.writeFileSync(tempRepoPath('dist', 'release', 'stale.txt'), 'stale build output\n');
      fs.mkdirSync(tempRepoPath('dist', 'claude-plugin'), { recursive: true });
      fs.writeFileSync(tempRepoPath('dist', 'claude-plugin', 'stale.txt'), 'stale build output\n');

      execFileSync('npm', ['run', 'build'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'tooling', 'copy-runtime-assets.js')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'entry-points', 'preamble-builders.js')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'mcp', 'maestro-server.js')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'tooling', 'generate.js')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'bin', 'maestro-mcp-server.js')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'bin', 'maestro-mcp-server.js')), true);
      assert.equal(
        execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', 'dist/src'], {
          cwd: repoRoot,
          encoding: 'utf8',
        }).trim(),
        ''
      );
      const declarationFiles = fs.readdirSync(tempRepoPath('dist', 'src'), { recursive: true })
        .filter((entry) => entry.endsWith('.d.ts') || entry.endsWith('.d.ts.map'));
      assert.deepEqual(declarationFiles, []);

      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'generated', 'runtime-content-registry.json')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'generated', 'runtime-content-registry.txt.gz')), true);
      for (const registryFile of [
        'agent-registry.json',
        'resource-registry.json',
        'hook-registry.json',
      ]) {
        assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'generated', registryFile)), true);
      }
      const agentRegistry = JSON.parse(
        fs.readFileSync(tempRepoPath('dist', 'src', 'generated', 'agent-registry.json'), 'utf8')
      );
      const resourceRegistry = JSON.parse(
        fs.readFileSync(tempRepoPath('dist', 'src', 'generated', 'resource-registry.json'), 'utf8')
      );
      const hookRegistry = JSON.parse(
        fs.readFileSync(tempRepoPath('dist', 'src', 'generated', 'hook-registry.json'), 'utf8')
      );
      assert.equal(agentRegistry.length, 39);
      assert.equal(resourceRegistry.delegation, 'skills/shared/delegation/SKILL.md');
      assert.deepEqual(hookRegistry['before-agent'], {
        module: 'hooks/logic/before-agent-logic.js',
        fn: 'handleBeforeAgent',
      });
      const runtimeContentRegistry = JSON.parse(
        fs.readFileSync(tempRepoPath('dist', 'src', 'generated', 'runtime-content-registry.json'), 'utf8')
      );
      assert.equal(runtimeContentRegistry.payload, 'runtime-content-registry.txt.gz');
      assert.equal(runtimeContentRegistry.payloadEncoding, 'gzip');
      assert.equal(Object.keys(runtimeContentRegistry.resources).length, 15);
      assert.equal(Object.keys(runtimeContentRegistry.agents).length, 39);
      assert.equal(Object.keys(runtimeContentRegistry.blueprints).length, 2);
      assert.equal(Array.isArray(runtimeContentRegistry.resources.delegation), true);
      for (const rawContentRoot of ['agents', 'references', 'skills', 'templates']) {
        assert.equal(fs.existsSync(tempRepoPath('dist', 'src', rawContentRoot)), false);
      }

      assert.equal(fs.existsSync(tempRepoPath('dist', 'agents')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'commands')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'claude', 'agents')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'release', 'stale.txt')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'claude-plugin', 'stale.txt')), true);

      execFileSync('npm', ['run', 'generate:run'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      assert.equal(fs.existsSync(tempRepoPath('agents', 'architect.md')), true);
      assert.equal(fs.existsSync(tempRepoPath('docs', 'runtime-codex.md')), true);
      assert.equal(fs.existsSync(tempRepoPath('src', 'generated', 'agent-registry.json')), true);

      const packageJson = JSON.parse(fs.readFileSync(tempRepoPath('package.json'), 'utf8'));
      assert.equal(packageJson.files.includes('dist'), false);
      assert.equal(packageJson.files.includes('dist/src/bin/maestro-install-codex.js'), true);
      assert.equal(packageJson.files.includes('dist/src/bin/maestro-mcp-server.js'), true);
      assert.equal(packageJson.files.includes('dist/src/mcp'), true);
      assert.equal(packageJson.files.includes('scripts'), false);
      assert.equal(packageJson.bin['maestro-install-codex'], './dist/src/bin/maestro-install-codex.js');
      assert.equal(packageJson.bin['maestro-mcp-server'], './dist/src/bin/maestro-mcp-server.js');
      assert.match(packageJson.scripts.build, /build:clean/);

      const { expandEntryPoints } = await import(
        pathToFileURL(tempRepoPath('dist', 'src', 'generator', 'entry-point-expander.js')).href
      );
      const generatedEntryPoints = await expandEntryPoints('gemini', tempRepoPath('src'));
      assert.ok(generatedEntryPoints.length > 0);
    } finally {
      cleanupTempRepo(repoRoot);
    }
  });
});
