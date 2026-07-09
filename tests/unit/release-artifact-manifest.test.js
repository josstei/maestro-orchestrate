import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DENIED_ARTIFACT_PATHS,
  RELEASE_ARTIFACT_PATHS,
  RUNTIME_DIST_PATHS,
  assertReleaseArtifactContents,
  assertRequiredArtifactPaths,
  assertRuntimeManifestShape,
  isDeniedPath,
  isReleaseArtifactPathAllowed,
} from '../../dist/src/tooling/release-artifact-manifest.js';

import {
  BUILD_ONLY_DIST_PATHS,
  BUILD_ONLY_SOURCE_PATHS,
  REMOVED_SHARED_AGENT_NAMES_MODULE,
  REMOVED_STATE_HELPER_SCRIPTS,
  ROOT,
} from '../support/contracts.js';

describe('release artifact manifest', () => {
  it('uses an explicit allowlist for required release surfaces', () => {
    const expectedPaths = [
      'gemini-extension.json',
      'qwen-extension.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      '.agents/plugins/marketplace.json',
      'claude/.mcp.json',
      'claude/agents',
      'claude/hooks',
      'claude/mcp',
      'claude/scripts',
      'claude/skills',
      'plugins/maestro/.codex-plugin',
      'plugins/maestro/.mcp.json',
      'plugins/maestro/references',
      'plugins/maestro/skills',
      'dist/src/bin/maestro-install-codex.js',
      'dist/src/bin/maestro-mcp-server.js',
    ];

    for (const expectedPath of expectedPaths) {
      assert.ok(
        RELEASE_ARTIFACT_PATHS.includes(expectedPath),
        `Expected release allowlist to include ${expectedPath}`
      );
    }

    for (const runtimeDistPath of RUNTIME_DIST_PATHS) {
      assert.ok(
        RELEASE_ARTIFACT_PATHS.includes(runtimeDistPath),
        `Expected release allowlist to include runtime dist ${runtimeDistPath}`
      );
    }

    assert.equal(RELEASE_ARTIFACT_PATHS.includes('src'), false);
    assert.equal(RELEASE_ARTIFACT_PATHS.includes('dist'), false);
    assert.equal(RELEASE_ARTIFACT_PATHS.some((releasePath) => releasePath.startsWith('src/')), false);
  });

  it('does not include denied paths in the release allowlist', () => {
    for (const releasePath of RELEASE_ARTIFACT_PATHS) {
      assert.equal(isDeniedPath(releasePath), false, `${releasePath} must not be denied`);
    }

    for (const deniedPath of DENIED_ARTIFACT_PATHS) {
      assert.equal(isDeniedPath(deniedPath), true, `${deniedPath} should be denied`);
      assert.equal(isDeniedPath(`${deniedPath}/nested.txt`), true, `${deniedPath}/nested.txt should be denied`);
    }
  });

  it('denies test-only files inside otherwise allowlisted runtime roots', () => {
    const testFile = 'claude/scripts/policy-enforcer.test.js';

    assert.equal(isReleaseArtifactPathAllowed(testFile), true);
    assert.equal(isDeniedPath(testFile), true);
  });

  it('denies private root scripts in release artifacts', () => {
    assert.equal(isReleaseArtifactPathAllowed('scripts/generate.js'), false);
    assert.equal(isDeniedPath('scripts/generate.js'), true);
  });

  it('denies package-root source checkout content in release artifacts', () => {
    for (const buildOnlyPath of BUILD_ONLY_SOURCE_PATHS) {
      assert.equal(
        isReleaseArtifactPathAllowed(buildOnlyPath),
        false,
        `${buildOnlyPath} must not be release-allowlisted`
      );
      assert.equal(isDeniedPath(buildOnlyPath), true, `${buildOnlyPath} must be denied`);
    }
  });

  it('denies build-only dist checkout tooling in release artifacts', () => {
    for (const buildOnlyPath of BUILD_ONLY_DIST_PATHS) {
      assert.equal(
        isReleaseArtifactPathAllowed(buildOnlyPath),
        false,
        `${buildOnlyPath} must not be release-allowlisted`
      );
      assert.equal(isDeniedPath(buildOnlyPath), true, `${buildOnlyPath} must be denied`);
    }
  });

  it('does not allow removed state helper scripts in release artifacts', () => {
    for (const removedScript of REMOVED_STATE_HELPER_SCRIPTS) {
      assert.equal(
        isReleaseArtifactPathAllowed(removedScript),
        false,
        `${removedScript} must not be release-allowlisted`
      );
    }
  });

  it('does not allow removed shared agent names module in release artifacts', () => {
    assert.equal(isReleaseArtifactPathAllowed(REMOVED_SHARED_AGENT_NAMES_MODULE), false);
  });

  it('fails when extracted artifact contents contain package-root source checkout tooling', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-source-tooling-'));

    try {
      const buildOnlyPath = path.join(tempRoot, 'src', 'generator', 'file-writer.js');
      fs.mkdirSync(path.dirname(buildOnlyPath), { recursive: true });
      fs.writeFileSync(buildOnlyPath, 'module.exports = {};\n');

      assert.throws(
        () => assertReleaseArtifactContents(tempRoot),
        /Release artifact contains denied paths: src, src\/generator, src\/generator\/file-writer\.js/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('allows only public bin files in release artifacts', () => {
    assert.equal(isReleaseArtifactPathAllowed('bin'), false);
    assert.equal(isReleaseArtifactPathAllowed('bin/maestro-install-codex.js'), false);
    assert.equal(isReleaseArtifactPathAllowed('bin/maestro-mcp-server.js'), false);
    assert.equal(isReleaseArtifactPathAllowed('bin/private-helper.js'), false);
    assert.equal(isReleaseArtifactPathAllowed('dist/bin'), false);
    assert.equal(isReleaseArtifactPathAllowed('dist/src/bin'), true);
    assert.equal(isReleaseArtifactPathAllowed('dist/src/bin/maestro-install-codex.js'), true);
    assert.equal(isReleaseArtifactPathAllowed('dist/src/bin/maestro-mcp-server.js'), true);
    assert.equal(isReleaseArtifactPathAllowed('dist/src/bin/private-helper.js'), false);
  });

  it('denies declaration files and source maps inside allowlisted dist runtime roots', () => {
    for (const privateDistPath of ['dist/src/mcp/maestro-server.d.ts', 'dist/src/mcp/maestro-server.js.map']) {
      assert.equal(isReleaseArtifactPathAllowed(privateDistPath), true);
      assert.equal(isDeniedPath(privateDistPath), true);
    }

    assert.equal(isReleaseArtifactPathAllowed('dist/src/bin/maestro-mcp-server.d.ts'), false);
    assert.equal(isDeniedPath('dist/src/bin/maestro-mcp-server.d.ts'), true);
  });

  it('allows parent directories needed to reach explicitly allowlisted files', () => {
    assert.equal(isReleaseArtifactPathAllowed('docs'), true);
    assert.equal(isReleaseArtifactPathAllowed('.agents/plugins'), true);
    assert.equal(isReleaseArtifactPathAllowed('unexpected-local-file.txt'), false);
  });

  it('fails when extracted artifact contents are outside the allowlist', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-unexpected-'));

    try {
      fs.writeFileSync(path.join(tempRoot, 'unexpected-local-file.txt'), 'secret\n');

      assert.throws(
        () => assertReleaseArtifactContents(tempRoot),
        /Release artifact contains unallowlisted paths: unexpected-local-file\.txt/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when extracted artifact contents contain denied file patterns', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-denied-'));

    try {
      const testFile = path.join(tempRoot, 'claude', 'scripts', 'policy-enforcer.test.js');
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, 'test\n');

      assert.throws(
        () => assertReleaseArtifactContents(tempRoot),
        /Release artifact contains denied paths: claude\/scripts\/policy-enforcer\.test\.js/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('fails when extracted artifact contents contain retired detached payloads', () => {
    for (const [runtimeName, payloadPath, expectedPattern] of [
      ['claude', 'claude/src/version.json', /Release artifact contains denied paths: claude\/src/],
      ['codex', 'plugins/maestro/src/version.json', /Release artifact contains denied paths: plugins\/maestro\/src/],
    ]) {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `maestro-release-${runtimeName}-payload-`));

      try {
        const retiredPayloadFile = path.join(tempRoot, payloadPath);
        fs.mkdirSync(path.dirname(retiredPayloadFile), { recursive: true });
        fs.writeFileSync(retiredPayloadFile, '{"version":"0.0.0"}\n');

        assert.throws(
          () => assertReleaseArtifactContents(tempRoot),
          expectedPattern
        );
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  });

  it('fails clearly when a required artifact path is missing', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-release-manifest-'));

    try {
      assert.throws(
        () => assertRequiredArtifactPaths(tempRoot),
        /Required release artifact paths are missing:/
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('keeps all runtime manifest versions aligned with package.json', () => {
    assert.doesNotThrow(() => assertRuntimeManifestShape(ROOT));
  });
});
