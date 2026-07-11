import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withMcpServer as withServer } from './mcp-stdio-client.js';
import { BUILD_ONLY_DIST_PATHS, BUILD_ONLY_SOURCE_PATHS } from '../support/contracts.js';
import { createTrackedCandidateRepoCopy } from '../support/filesystem.js';
import { REPO_ROOT } from '../support/paths.js';

function parsePackJson(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`npm pack did not emit JSON output:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(start, end + 1));
}

function runNpmPack(root) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-pack-install-cache-'));

  try {
    const stdout = execFileSync('npm', ['pack', '--json', '--cache', cacheDir], {
      cwd: root,
      encoding: 'utf8',
    });
    const [packageInfo] = parsePackJson(stdout);

    return {
      packageInfo,
      tarballPath: path.join(root, packageInfo.filename),
    };
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

function installPackage(tarballPath, installRoot) {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-pack-npm-cache-'));

  try {
    execFileSync('npm', ['install', tarballPath, '--prefix', installRoot, '--ignore-scripts', '--cache', cacheDir], {
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
}

describe('npm package surface', () => {
  it('installs only public package files and runs both package bins', async () => {
    const repoRoot = createTrackedCandidateRepoCopy({
      dependencyRoot: path.join(REPO_ROOT, 'node_modules'),
    });
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-npm-install-'));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-npm-home-'));

    try {
      assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'src')), false);
      assert.equal(fs.existsSync(path.join(repoRoot, 'src', 'generated')), false);
      assert.equal(fs.lstatSync(path.join(repoRoot, 'node_modules')).isSymbolicLink(), true);

      const { packageInfo, tarballPath } = runNpmPack(repoRoot);
      const entries = packageInfo.files.map((file) => file.path);

      assert.equal(fs.existsSync(path.join(repoRoot, 'dist', 'src')), true);

      assert.equal(entries.some((entry) => entry === 'src' || entry.startsWith('src/')), false);
      assert.equal(entries.some((entry) => entry.startsWith('scripts/')), false);
      assert.equal(entries.some((entry) => entry.startsWith('bin/')), false);
      assert.equal(entries.some((entry) => entry.endsWith('.d.ts')), false);
      assert.equal(entries.some((entry) => entry.endsWith('.map')), false);
      assert.ok(entries.includes('dist/src/bin/maestro-install-codex.js'));
      assert.ok(entries.includes('dist/src/bin/maestro-mcp-server.js'));
      assert.ok(entries.includes('dist/src/mcp/maestro-server.js'));
      assert.ok(entries.includes('dist/src/platforms/codex/runtime-config.js'));
      assert.equal(entries.includes('claude/src/version.json'), false);
      assert.equal(entries.includes('plugins/maestro/src/version.json'), false);
      for (const buildOnlyPath of BUILD_ONLY_SOURCE_PATHS) {
        assert.equal(entries.includes(buildOnlyPath), false, `${buildOnlyPath} must not be packaged`);
      }
      for (const buildOnlyPath of BUILD_ONLY_DIST_PATHS) {
        assert.equal(entries.includes(buildOnlyPath), false, `${buildOnlyPath} must not be packaged`);
      }
      assert.equal(
        entries.some((entry) => entry.startsWith('src/generator/')),
        false
      );
      assert.equal(
        entries.some((entry) => entry.startsWith('src/transforms/')),
        false
      );
      assert.equal(
        entries.some((entry) => entry.startsWith('src/entry-points/')),
        false
      );
      assert.equal(
        entries.some((entry) => entry.startsWith('src/lib/discovery/')),
        false
      );
      assert.equal(
        entries.some((entry) => /^src\/platforms\/[^/]+\/metadata\.ts$/.test(entry)),
        false
      );
      assert.equal(
        entries.some((entry) => entry.startsWith('dist/src/generator/')),
        false
      );
      assert.equal(
        entries.some((entry) => entry.startsWith('dist/src/transforms/')),
        false
      );
      assert.equal(
        entries.some((entry) => entry.startsWith('dist/src/entry-points/')),
        false
      );
      assert.equal(
        entries.some((entry) => entry.startsWith('dist/src/lib/discovery/')),
        false
      );
      assert.equal(
        entries.some((entry) => /^dist\/src\/platforms\/[^/]+\/metadata\.js$/.test(entry)),
        false
      );

      installPackage(tarballPath, installRoot);

      const packageRoot = path.join(installRoot, 'node_modules', '@josstei', 'maestro');
      const installedPackageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
      assert.equal(installedPackageJson.bin['maestro-install-codex'], './dist/src/bin/maestro-install-codex.js');
      assert.equal(installedPackageJson.bin['maestro-mcp-server'], './dist/src/bin/maestro-mcp-server.js');
      assert.equal(fs.existsSync(path.join(packageRoot, 'src')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'scripts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'bin')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'scripts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'claude', 'src')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'plugins', 'maestro', 'src')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'generator')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'transforms')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'entry-points')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'lib', 'discovery')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'lib', 'yaml-emit.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'manifest.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'platforms', 'metadata.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'platforms', 'metadata-shared.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'platforms', 'codex', 'metadata.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'platforms', 'runtime-payload-contract.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'bin', 'maestro-mcp-server.d.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'mcp', 'maestro-server.d.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'mcp', 'maestro-server.js')), true);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'lib', 'framework-detection.js')), true);
      assert.equal(fs.existsSync(path.join(packageRoot, 'dist', 'src', 'platforms', 'codex', 'runtime-config.js')), true);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'generator')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'transforms')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'entry-points')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'discovery')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'yaml-emit.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'manifest.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'metadata.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'metadata-shared.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'codex', 'metadata.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'runtime-payload-contract.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'mcp', 'maestro-server.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'framework-detection.ts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'codex', 'runtime-config.ts')), false);

      const installerBin = path.join(installRoot, 'node_modules', '.bin', 'maestro-install-codex');
      const installOutput = execFileSync(installerBin, [], {
        cwd: installRoot,
        env: { ...process.env, HOME: homeDir },
        encoding: 'utf8',
      });
      const installedPluginRoot = path.join(homeDir, '.codex', 'plugins', 'maestro');
      assert.match(installOutput, /Maestro installed for Codex\./);
      assert.match(installOutput, /Plugin source:/);
      assert.ok(fs.existsSync(path.join(installedPluginRoot, '.codex-plugin', 'plugin.json')));
      assert.ok(fs.existsSync(path.join(installedPluginRoot, '.mcp.json')));
      assert.ok(fs.existsSync(path.join(installedPluginRoot, '.app.json')));
      assert.ok(fs.existsSync(path.join(installedPluginRoot, 'skills', 'execute', 'SKILL.md')));
      assert.ok(fs.existsSync(path.join(installedPluginRoot, 'references', 'runtime-guide.md')));
      assert.equal(fs.existsSync(path.join(installedPluginRoot, 'src')), false);

      const serverBin = path.join(installRoot, 'node_modules', '.bin', 'maestro-mcp-server');
      assert.ok(fs.existsSync(serverBin));

      await withServer(
        {
          cwd: installRoot,
          relativePath: serverBin,
          env: { MAESTRO_EXTENSION_PATH: '', MAESTRO_RUNTIME: 'codex' },
        },
        async (client) => {
          const runtimeResult = await client.callTool('get_runtime_context');
          const skillResult = await client.callTool('get_skill_content', {
            resources: ['delegation'],
          });
          const agentResult = await client.callTool('get_agent', {
            agents: ['coder'],
          });
          const workspaceResult = await client.callTool('initialize_workspace', {
            workspace_path: installRoot,
          });
          const blueprintListResult = await client.callTool('list_session_blueprints', {});
          const blueprintResult = await client.callTool('instantiate_session_blueprint', {
            blueprint_id: 'add-rest-endpoint',
            task: 'add /users endpoint',
          });

          assert.equal(runtimeResult.parsed.runtime, 'codex');
          assert.ok(skillResult.parsed.contents.delegation.includes('# Delegation Skill'));
          assert.deepEqual(skillResult.parsed.errors, {});
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
          assert.deepEqual(agentResult.parsed.errors, {});
          assert.equal(workspaceResult.parsed.success, true);
          assert.deepEqual(blueprintListResult.parsed.blueprints, [
            { id: 'add-db-migration', title: 'Add Database Migration' },
            { id: 'add-rest-endpoint', title: 'Add REST Endpoint' },
          ]);
          assert.equal(blueprintResult.parsed.task, 'add /users endpoint');
          assert.equal(blueprintResult.parsed.phases.length, 5);
          assert.equal(typeof blueprintResult.parsed.design_outline, 'string');
        }
      );
    } finally {
      fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
      fs.rmSync(installRoot, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
