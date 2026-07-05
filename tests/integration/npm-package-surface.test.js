import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempRepoCopy } from './helpers.js';
import { spawnMcpServer } from './mcp-stdio-client.js';

const BUILD_ONLY_SOURCE_PATHS = [
  'src/generator/file-writer.js',
  'src/transforms/index.js',
  'src/entry-points/registry.js',
  'src/lib/discovery/index.js',
  'src/lib/yaml-emit.js',
  'src/manifest.js',
  'src/platforms/metadata.js',
  'src/platforms/metadata-shared.js',
  'src/platforms/claude/metadata.js',
  'src/platforms/runtime-payload-contract.js',
];

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

async function withServer(options, fn) {
  const client = spawnMcpServer(options);
  try {
    await client.ready;
    await client.initialize();
    return await fn(client);
  } finally {
    await client.close();
  }
}

describe('npm package surface', () => {
  it('installs only public package files and runs both package bins', async () => {
    const repoRoot = createTempRepoCopy('maestro-npm-package-');
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-npm-install-'));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-npm-home-'));

    try {
      const { packageInfo, tarballPath } = runNpmPack(repoRoot);
      const entries = packageInfo.files.map((file) => file.path);

      assert.equal(entries.some((entry) => entry.startsWith('scripts/')), false);
      assert.ok(entries.includes('bin/maestro-install-codex.js'));
      assert.ok(entries.includes('bin/maestro-mcp-server.js'));
      assert.ok(entries.includes('src/mcp/maestro-server.js'));
      assert.ok(entries.includes('src/platforms/codex/runtime-config.js'));
      assert.equal(entries.includes('claude/src/version.json'), false);
      assert.equal(entries.includes('plugins/maestro/src/version.json'), false);
      for (const buildOnlyPath of BUILD_ONLY_SOURCE_PATHS) {
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
        entries.some((entry) => /^src\/platforms\/[^/]+\/metadata\.js$/.test(entry)),
        false
      );

      installPackage(tarballPath, installRoot);

      const packageRoot = path.join(installRoot, 'node_modules', '@josstei', 'maestro');
      assert.equal(fs.existsSync(path.join(packageRoot, 'scripts')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'claude', 'src')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'plugins', 'maestro', 'src')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'generator')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'transforms')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'entry-points')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'discovery')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'yaml-emit.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'manifest.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'metadata.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'metadata-shared.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'codex', 'metadata.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'runtime-payload-contract.js')), false);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'mcp', 'maestro-server.js')), true);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'lib', 'framework-detection.js')), true);
      assert.equal(fs.existsSync(path.join(packageRoot, 'src', 'platforms', 'codex', 'runtime-config.js')), true);

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

          assert.equal(runtimeResult.parsed.runtime, 'codex');
          assert.ok(skillResult.parsed.contents.delegation.includes('# Delegation Skill'));
          assert.deepEqual(skillResult.parsed.errors, {});
          assert.ok(agentResult.parsed.agents.coder.body.includes('Senior Software Engineer'));
          assert.deepEqual(agentResult.parsed.errors, {});
        }
      );
    } finally {
      fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
      fs.rmSync(installRoot, { recursive: true, force: true });
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
