import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');

function createTempRepoCopy(prefix) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoRoot = path.join(tempRoot, 'repo');

  fs.cpSync(ROOT, repoRoot, {
    recursive: true,
    filter: (source) => {
      const relativePath = path.relative(ROOT, source);
      if (!relativePath) {
        return true;
      }

      const segments = relativePath.split(path.sep);
      return !segments.includes('.git') && !segments.includes('node_modules') && segments[0] !== 'dist';
    },
  });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(repoRoot, 'node_modules'), 'dir');

  return repoRoot;
}

function cleanupTempRepo(repoRoot) {
  fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
}

describe('TypeScript build contract', () => {
  it('emits transitional dist code and copied runtime assets for package-bin execution', async () => {
    const repoRoot = createTempRepoCopy('maestro-ts-build-contract-');

    try {
      const tempRepoPath = (...parts) => path.join(repoRoot, ...parts);

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
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'tooling', 'copy-runtime-assets.d.ts')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'tooling', 'copy-runtime-assets.d.ts.map')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'mcp', 'server', 'tool-types.d.ts')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'mcp', 'tool-packs', 'contracts.d.ts')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'mcp', 'tool-packs', 'command-table.d.ts')), true);

      const contractsDeclaration = fs.readFileSync(
        tempRepoPath('dist', 'src', 'mcp', 'tool-packs', 'contracts.d.ts'),
        'utf8',
      );
      assert.match(contractsDeclaration, /MaestroToolRegistry/);
      assert.match(contractsDeclaration, /ToolHandler<TArgs, TResult>/);
      assert.doesNotMatch(contractsDeclaration, /declare function defineTool\([^)]*: any/);

      const commandTableDeclaration = fs.readFileSync(
        tempRepoPath('dist', 'src', 'mcp', 'tool-packs', 'command-table.d.ts'),
        'utf8',
      );
      assert.match(commandTableDeclaration, /export type CommandTable<TSchemas extends ToolSchemaMap>/);
      assert.match(commandTableDeclaration, /withRequiredProjectRoot/);
      assert.match(commandTableDeclaration, /registerCommandTable<TSchemas extends ToolSchemaMap>/);

      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'generated', 'runtime-content-registry.json')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'src', 'generated', 'runtime-content-registry.txt')), true);
      const runtimeContentRegistry = JSON.parse(
        fs.readFileSync(tempRepoPath('dist', 'src', 'generated', 'runtime-content-registry.json'), 'utf8')
      );
      assert.equal(runtimeContentRegistry.payload, 'runtime-content-registry.txt');
      assert.equal(Object.keys(runtimeContentRegistry.resources).length, 15);
      assert.equal(Object.keys(runtimeContentRegistry.agents).length, 39);
      assert.equal(Object.keys(runtimeContentRegistry.blueprints).length, 2);
      assert.equal(Array.isArray(runtimeContentRegistry.resources.delegation), true);
      for (const retiredContentRoot of ['agents', 'references', 'skills', 'templates']) {
        assert.equal(fs.existsSync(tempRepoPath('dist', 'src', retiredContentRoot)), false);
      }

      assert.equal(fs.existsSync(tempRepoPath('dist', 'agents')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'commands')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'claude', 'agents')), false);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'release', 'stale.txt')), true);
      assert.equal(fs.existsSync(tempRepoPath('dist', 'claude-plugin', 'stale.txt')), true);

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
