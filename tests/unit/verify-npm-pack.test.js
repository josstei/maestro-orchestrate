import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  PACKAGE_BUDGET,
  PACKAGE_SURFACE_RULES,
  PRIVATE_SCRIPT_ROLES,
  assertNoPackagedRootScripts,
  classifyPackageEntry,
  parsePackExecutionArgs,
  parsePackJson,
  verifyPackageEntries,
} from '../../dist/src/tooling/verify-npm-pack.js';

import { REQUIRED_PACKAGE_FILES, RUNTIME_DIST_PATHS } from '../../dist/src/tooling/release-artifact-manifest.js';
import {
  BUILD_ONLY_DIST_PATHS,
  BUILD_ONLY_SOURCE_PATHS,
  EXPECTED_REQUIRED_PACKAGE_FILES,
  FORBIDDEN_RUNTIME_TEST_PATHS,
  RAW_DIST_CONTENT_PATHS,
  RELEASE_ONLY_PACKAGE_DOCS,
  FORBIDDEN_DETACHED_PAYLOAD_FILES,
  escaped,
  packageFiles,
  packageJson,
} from '../support/contracts.js';
import { makeTempDir, writeFixtureFile } from '../support/filesystem.js';
import { REPO_ROOT } from '../support/paths.js';

describe('verify npm pack', () => {
  it('parses npm pack JSON after lifecycle output', () => {
    const parsed = parsePackJson('> prepack\nGeneration complete\n[{"filename":"pkg.tgz","files":[]}]\n');

    assert.equal(parsed[0].filename, 'pkg.tgz');
  });

  it('keeps scripts enabled by default and strictly parses ignore-scripts', () => {
    assert.deepEqual(parsePackExecutionArgs([]), {});
    assert.deepEqual(parsePackExecutionArgs(['--ignore-scripts']), { ignoreScripts: true });
    assert.throws(
      () => parsePackExecutionArgs(['--unknown']),
      /Unknown option '--unknown'/
    );
    assert.throws(
      () => parsePackExecutionArgs(['archive.tgz']),
      /Unexpected argument 'archive\.tgz'/
    );
  });

  it('passes the compiled CLI ignore-scripts choice to the child npm process', (t) => {
    const tempRoot = makeTempDir(t, 'maestro-pack-cli-');
    const binRoot = path.join(tempRoot, 'bin');
    const npmArgsPath = path.join(tempRoot, 'npm-args.json');
    const fakeNpmPath = writeFixtureFile(
      binRoot,
      'npm',
      `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.MAESTRO_NPM_ARGS_PATH, JSON.stringify(process.argv.slice(2)));
process.stdout.write(process.env.MAESTRO_PACK_JSON);
`,
    );
    fs.chmodSync(fakeNpmPath, 0o755);

    const runCli = (args) => {
      execFileSync(
        process.execPath,
        [path.join(REPO_ROOT, 'dist', 'src', 'tooling', 'verify-npm-pack.js'), ...args],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${binRoot}${path.delimiter}${process.env.PATH || ''}`,
            MAESTRO_NPM_ARGS_PATH: npmArgsPath,
            MAESTRO_PACK_JSON: JSON.stringify(packageFiles()),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      return JSON.parse(fs.readFileSync(npmArgsPath, 'utf8'));
    };

    const scriptsEnabledArgs = runCli([]);
    assert.deepEqual(scriptsEnabledArgs.slice(0, 3), ['pack', '--dry-run', '--json']);
    assert.equal(scriptsEnabledArgs[3], '--cache');
    assert.equal(scriptsEnabledArgs.includes('--ignore-scripts'), false);

    const ignoreScriptsArgs = runCli(['--ignore-scripts']);
    assert.deepEqual(ignoreScriptsArgs.slice(0, 3), ['pack', '--dry-run', '--json']);
    assert.equal(ignoreScriptsArgs[3], '--cache');
    assert.equal(ignoreScriptsArgs.at(-1), '--ignore-scripts');
  });

  it('rejects unknown options through the compiled CLI', () => {
    assert.throws(
      () => execFileSync(
        process.execPath,
        [path.join(REPO_ROOT, 'dist', 'src', 'tooling', 'verify-npm-pack.js'), '--unknown'],
        {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
      (error) => {
        assert.equal(error.status, 1);
        assert.match(String(error.stderr), /Unknown option '--unknown'/);
        return true;
      },
    );
  });

  it('requires release-critical files in the package', () => {
    assert.deepEqual(REQUIRED_PACKAGE_FILES, EXPECTED_REQUIRED_PACKAGE_FILES);
    assert.doesNotThrow(() => verifyPackageEntries(packageFiles()));
  });

  it('requires every literal test-owned runtime package invariant in the package', () => {
    for (const requiredPath of EXPECTED_REQUIRED_PACKAGE_FILES) {
      const [packageInfo] = packageFiles();
      packageInfo.files = packageInfo.files.filter((file) => file.path !== requiredPath);

      assert.throws(
        () => verifyPackageEntries([packageInfo]),
        new RegExp(`npm package missing required file: ${requiredPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('rejects test-only package content', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['tests/unit/example.test.js'])),
      /npm package contains forbidden path: tests\/unit\/example\.test\.js/
    );
  });

  it('rejects nested test-only files inside runtime package roots', () => {
    for (const forbiddenPath of FORBIDDEN_RUNTIME_TEST_PATHS) {
      assert.throws(
        () => verifyPackageEntries(packageFiles([forbiddenPath])),
        new RegExp(`npm package contains forbidden path: ${forbiddenPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('rejects unclassified package paths even when they are not denied', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['unexpected-runtime/file.txt'])),
      /npm package contains unclassified paths: unexpected-runtime\/file\.txt/
    );
  });

  it('rejects duplicate runtime-local source payloads', () => {
    for (const payloadPath of FORBIDDEN_DETACHED_PAYLOAD_FILES) {
      assert.throws(
        () => verifyPackageEntries(packageFiles([payloadPath])),
        new RegExp(`npm package contains forbidden path: ${payloadPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      );
    }
  });

  it('classifies both public bins as the package command surface', () => {
    assert.deepEqual(classifyPackageEntry('bin/maestro-install-codex.js'), []);
    assert.deepEqual(classifyPackageEntry('bin/maestro-mcp-server.js'), []);
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-install-codex.js'), ['public-bin', 'runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-mcp-server.js'), ['public-bin', 'runtime-dist']);
  });

  it('does not classify package-root source as package runtime content', () => {
    assert.equal(PACKAGE_SURFACE_RULES.some((rule) => rule.id === 'canonical-source'), false);
    assert.equal(PACKAGE_SURFACE_RULES.some((rule) => rule.id === 'runtime-source'), false);

    for (const sourcePath of [
      'src/mcp/maestro-server.ts',
      'src/platforms/claude/runtime-config.ts',
      'src/lib/framework-detection.ts',
    ]) {
      assert.deepEqual(classifyPackageEntry(sourcePath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([sourcePath])),
        new RegExp(`npm package contains forbidden path: ${escaped(sourcePath)}`)
      );
    }
  });

  it('classifies final dist runtime only through the explicit runtime-dist inventory', () => {
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-install-codex.js'), ['public-bin', 'runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/bin/maestro-mcp-server.js'), ['public-bin', 'runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/mcp/maestro-server.js'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/platforms/claude/runtime-config.js'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/platforms/runtime-declarations.js'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/generated/runtime-content-registry.json'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/generated/runtime-content-registry.txt.gz'), ['runtime-dist']);
    assert.deepEqual(classifyPackageEntry('dist/src/generator/file-writer.js'), []);
  });

  it('rejects release-only docs if npm includes them', () => {
    for (const docPath of RELEASE_ONLY_PACKAGE_DOCS) {
      assert.deepEqual(classifyPackageEntry(docPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([docPath])),
        new RegExp(`npm package contains unclassified paths: ${escaped(docPath)}`)
      );
    }
  });

  it('does not classify raw dist content directories as package runtime content', () => {
    for (const rawContentPath of RAW_DIST_CONTENT_PATHS) {
      assert.deepEqual(classifyPackageEntry(rawContentPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([rawContentPath])),
        new RegExp(`npm package contains unclassified paths: ${escaped(rawContentPath)}`)
      );
    }
  });

  it('keeps package.json free of private package roots', () => {
    const normalizePackagePath = (filePath) => filePath.replace(/\/+$/, '');
    const privateRootPaths = packageJson.files
      .map(normalizePackagePath)
      .filter((filePath) =>
        filePath === 'src' ||
        filePath.startsWith('src/') ||
        filePath === 'scripts' ||
        filePath.startsWith('scripts/') ||
        filePath === 'bin' ||
        filePath.startsWith('bin/')
      )
      .sort();

    assert.deepEqual(privateRootPaths, []);
  });

  it('keeps package.json dist runtime entries aligned with the shared final inventory', () => {
    const normalizePackagePath = (filePath) => filePath.replace(/\/+$/, '');
    const packageRuntimeDistPaths = packageJson.files
      .map(normalizePackagePath)
      .filter((filePath) => filePath === 'dist' || filePath.startsWith('dist/'))
      .sort();

    assert.equal(packageRuntimeDistPaths.includes('dist'), false);
    assert.deepEqual(packageRuntimeDistPaths, [...RUNTIME_DIST_PATHS].sort());
  });

  it('rejects package-root source checkout tooling as forbidden package content', () => {
    for (const buildOnlyPath of BUILD_ONLY_SOURCE_PATHS) {
      assert.deepEqual(classifyPackageEntry(buildOnlyPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([buildOnlyPath])),
        new RegExp(`npm package contains forbidden path: ${escaped(buildOnlyPath)}`)
      );
    }
  });

  it('rejects build-only dist checkout tooling as forbidden package content', () => {
    for (const buildOnlyPath of BUILD_ONLY_DIST_PATHS) {
      assert.deepEqual(classifyPackageEntry(buildOnlyPath), []);
      assert.throws(
        () => verifyPackageEntries(packageFiles([buildOnlyPath])),
        new RegExp(`npm package contains forbidden path: ${escaped(buildOnlyPath)}`)
      );
    }
  });

  it('rejects declaration files and source maps inside otherwise allowlisted dist runtime roots', () => {
    for (const privateDistPath of [
      'dist/src/bin/maestro-mcp-server.d.ts',
      'dist/src/mcp/maestro-server.d.ts',
      'dist/src/mcp/maestro-server.js.map',
    ]) {
      assert.throws(
        () => verifyPackageEntries(packageFiles([privateDistPath])),
        new RegExp(`npm package contains forbidden path: ${escaped(privateDistPath)}`)
      );
    }
  });

  it('keeps private source-checkout scripts documented but unpublished', () => {
    const scriptPaths = Object.keys(PRIVATE_SCRIPT_ROLES);
    const validRoles = new Set(['release-only', 'dev-only']);

    for (const scriptPath of scriptPaths) {
      assert.deepEqual(classifyPackageEntry(scriptPath), []);
      assert.ok(validRoles.has(PRIVATE_SCRIPT_ROLES[scriptPath].role));
    }

    assert.doesNotThrow(() => assertNoPackagedRootScripts([]));
  });

  it('rejects any packaged root scripts as private source-checkout content', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['scripts/generate.js'])),
      /npm package contains private root scripts: scripts\/generate\.js/
    );

    assert.throws(
      () => verifyPackageEntries(packageFiles(['scripts/new-helper.js'])),
      /npm package contains private root scripts: scripts\/new-helper\.js/
    );
  });

  it('rejects any packaged root bins as private source-checkout content', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles(['bin/maestro-mcp-server.js'])),
      /npm package contains forbidden path: bin\/maestro-mcp-server\.js/
    );
  });

  it('enforces package entry and size budgets', () => {
    assert.throws(
      () => verifyPackageEntries(packageFiles([], {
        size: PACKAGE_BUDGET.maxPackedSize + 1,
        unpackedSize: PACKAGE_BUDGET.maxUnpackedSize + 1,
      })),
      /npm package exceeds budgets: packedSize/
    );
  });

  it('requires npm pack size metadata before enforcing budgets', () => {
    const [packageInfo] = packageFiles();
    delete packageInfo.size;
    delete packageInfo.unpackedSize;

    assert.throws(
      () => verifyPackageEntries([packageInfo]),
      /npm package exceeds budgets: packedSize metadata missing, unpackedSize metadata missing/
    );
  });
});
