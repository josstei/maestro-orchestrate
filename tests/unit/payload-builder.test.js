'use strict';

const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DETACHED_PAYLOAD_BASE_ALLOWLIST,
  buildPayloadAllowlist,
  shouldIncludeInPayload,
  isForeignAdapter,
  shouldDescendInto,
  buildDetachedPayload,
  stampVersion,
} = require('../../src/generator/payload-builder');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanupDir(dirPath) {
  if (dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function writeFile(base, relativePath, content) {
  const fullPath = path.join(base, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

describe('DETACHED_PAYLOAD_BASE_ALLOWLIST', () => {
  it('is a frozen array', () => {
    assert.ok(Object.isFrozen(DETACHED_PAYLOAD_BASE_ALLOWLIST));
    assert.ok(Array.isArray(DETACHED_PAYLOAD_BASE_ALLOWLIST));
  });

  it('includes generated/ for future registry support', () => {
    assert.ok(
      DETACHED_PAYLOAD_BASE_ALLOWLIST.includes('generated/'),
      'DETACHED_PAYLOAD_BASE_ALLOWLIST must include "generated/"'
    );
  });

  it('includes all expected base prefixes', () => {
    const expected = [
      'core/',
      'config/',
      'hooks/',
      'mcp/',
      'platforms/shared/',
      'state/',
      'agents/',
      'skills/',
      'references/',
      'templates/',
      'entry-points/',
      'generated/',
    ];

    for (const prefix of expected) {
      assert.ok(
        DETACHED_PAYLOAD_BASE_ALLOWLIST.includes(prefix),
        `Missing expected prefix: ${prefix}`
      );
    }
  });
});

describe('shouldIncludeInPayload', () => {
  it('matches files under known allowlisted prefixes', () => {
    assert.ok(shouldIncludeInPayload('core/logger.js'));
    assert.ok(shouldIncludeInPayload('mcp/handlers/workspace.js'));
    assert.ok(shouldIncludeInPayload('hooks/shared/hook-logic.js'));
    assert.ok(shouldIncludeInPayload('generated/agent-registry.json'));
  });

  it('rejects files under non-allowlisted prefixes', () => {
    assert.ok(!shouldIncludeInPayload('scripts/generate.js'));
    assert.ok(!shouldIncludeInPayload('transforms/copy.js'));
    assert.ok(!shouldIncludeInPayload('manifest.js'));
    assert.ok(!shouldIncludeInPayload('platforms/claude/runtime-config.js'));
  });

  it('uses custom allowlist when provided', () => {
    const custom = ['custom/'];
    assert.ok(shouldIncludeInPayload('custom/file.js', custom));
    assert.ok(!shouldIncludeInPayload('core/logger.js', custom));
  });

  it('defaults to base allowlist when no allowlist provided', () => {
    assert.ok(shouldIncludeInPayload('core/logger.js', undefined));
    assert.ok(!shouldIncludeInPayload('scripts/build.js', undefined));
  });
});

describe('isForeignAdapter', () => {
  it('returns false for paths outside the adapters directory', () => {
    assert.ok(!isForeignAdapter('core/logger.js', 'claude'));
    assert.ok(!isForeignAdapter('hooks/shared/hook-logic.js', 'claude'));
  });

  it('returns false for the matching runtime adapter', () => {
    assert.ok(!isForeignAdapter('platforms/shared/adapters/claude-adapter.js', 'claude'));
    assert.ok(!isForeignAdapter('platforms/shared/adapters/gemini-adapter.js', 'gemini'));
  });

  it('returns true for foreign runtime adapters', () => {
    assert.ok(isForeignAdapter('platforms/shared/adapters/gemini-adapter.js', 'claude'));
    assert.ok(isForeignAdapter('platforms/shared/adapters/qwen-adapter.js', 'claude'));
    assert.ok(isForeignAdapter('platforms/shared/adapters/claude-adapter.js', 'gemini'));
  });

  it('returns false for non-adapter files in the adapters directory', () => {
    assert.ok(!isForeignAdapter('platforms/shared/adapters/exit-codes.js', 'claude'));
    assert.ok(!isForeignAdapter('platforms/shared/adapters/conventions.js', 'claude'));
  });

  it('returns false for nested paths under adapters/', () => {
    assert.ok(!isForeignAdapter('platforms/shared/adapters/sub/claude-adapter.js', 'claude'));
  });
});

describe('shouldDescendInto', () => {
  it('allows descent into directories that are parents of allowlisted prefixes', () => {
    assert.ok(shouldDescendInto('platforms'));
    assert.ok(shouldDescendInto('platforms/'));
  });

  it('allows descent into directories within allowlisted prefixes', () => {
    assert.ok(shouldDescendInto('core'));
    assert.ok(shouldDescendInto('core/'));
    assert.ok(shouldDescendInto('core/utils'));
    assert.ok(shouldDescendInto('mcp/handlers'));
  });

  it('rejects directories outside any allowlisted prefix tree', () => {
    assert.ok(!shouldDescendInto('scripts'));
    assert.ok(!shouldDescendInto('transforms'));
    assert.ok(!shouldDescendInto('node_modules'));
  });

  it('uses custom allowlist when provided', () => {
    const custom = ['deep/nested/path/'];
    assert.ok(shouldDescendInto('deep', custom));
    assert.ok(shouldDescendInto('deep/nested', custom));
    assert.ok(shouldDescendInto('deep/nested/path', custom));
    assert.ok(shouldDescendInto('deep/nested/path/sub', custom));
    assert.ok(!shouldDescendInto('other', custom));
  });

  it('handles directories with and without trailing slashes', () => {
    assert.equal(shouldDescendInto('core'), shouldDescendInto('core/'));
    assert.equal(shouldDescendInto('scripts'), shouldDescendInto('scripts/'));
  });
});

describe('buildPayloadAllowlist', () => {
  it('extends the base allowlist with runtime-specific config entry', () => {
    const result = buildPayloadAllowlist('claude');
    assert.ok(result.includes('platforms/claude/runtime-config.js'));
  });

  it('includes all base allowlist entries', () => {
    const result = buildPayloadAllowlist('codex');
    for (const prefix of DETACHED_PAYLOAD_BASE_ALLOWLIST) {
      assert.ok(result.includes(prefix), `Missing base prefix: ${prefix}`);
    }
  });

  it('adds only one additional entry beyond the base', () => {
    const result = buildPayloadAllowlist('gemini');
    assert.equal(result.length, DETACHED_PAYLOAD_BASE_ALLOWLIST.length + 1);
  });

  it('constructs the correct platform path for any runtime', () => {
    const result = buildPayloadAllowlist('test-runtime');
    assert.ok(result.includes('platforms/test-runtime/runtime-config.js'));
  });
});

describe('buildDetachedPayload', () => {
  let srcDir = null;
  let outputDir = null;

  afterEach(() => {
    cleanupDir(srcDir);
    cleanupDir(outputDir);
    srcDir = null;
    outputDir = null;
  });

  it('copies files matching the allowlist', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'module.exports = {};');
    writeFile(srcDir, 'mcp/server.js', 'module.exports = {};');
    writeFile(srcDir, 'generated/registry.json', '{}');

    const stats = buildDetachedPayload(srcDir, outputDir);

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(fs.existsSync(path.join(outputDir, 'mcp', 'server.js')));
    assert.ok(fs.existsSync(path.join(outputDir, 'generated', 'registry.json')));
    assert.ok(stats.copied >= 3);
  });

  it('skips files not matching the allowlist', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'allowed');
    writeFile(srcDir, 'scripts/build.js', 'disallowed');
    writeFile(srcDir, 'transforms/copy.js', 'disallowed');

    const stats = buildDetachedPayload(srcDir, outputDir);

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'scripts', 'build.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'transforms', 'copy.js')));
    assert.ok(stats.skipped > 0);
  });

  it('removes stale files from the output directory', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'kept');
    writeFile(outputDir, 'core/old-file.js', 'stale');

    const stats = buildDetachedPayload(srcDir, outputDir);

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'old-file.js')));
    assert.equal(stats.removed, 1);
  });

  it('does not rewrite files when content is unchanged', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'same content');
    writeFile(outputDir, 'core/logger.js', 'same content');

    const stats = buildDetachedPayload(srcDir, outputDir);

    assert.equal(stats.copied, 0);
  });

  it('preserves version.json in output when runtimeName is provided', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'version.json', '{"version":"1.0.0"}');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude');

    assert.ok(fs.existsSync(path.join(outputDir, 'version.json')));
    assert.equal(stats.removed, 0);
  });

  it('removes version.json from output when no runtimeName is provided', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'version.json', '{"version":"1.0.0"}');

    const stats = buildDetachedPayload(srcDir, outputDir);

    assert.ok(!fs.existsSync(path.join(outputDir, 'version.json')));
    assert.equal(stats.removed, 1);
  });

  it('adds runtime-specific platform config to allowlist', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'platforms/claude/runtime-config.js', 'config');
    writeFile(srcDir, 'platforms/codex/runtime-config.js', 'other config');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude');

    assert.ok(fs.existsSync(path.join(outputDir, 'platforms', 'claude', 'runtime-config.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'platforms', 'codex', 'runtime-config.js')));
  });

  it('includes only matching adapter and shared utilities for claude runtime', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'platforms/shared/adapters/claude-adapter.js', 'claude');
    writeFile(srcDir, 'platforms/shared/adapters/gemini-adapter.js', 'gemini');
    writeFile(srcDir, 'platforms/shared/adapters/qwen-adapter.js', 'qwen');
    writeFile(srcDir, 'platforms/shared/adapters/exit-codes.js', 'codes');
    writeFile(srcDir, 'platforms/shared/adapters/conventions.js', 'conventions');
    writeFile(srcDir, 'platforms/shared/hook-runner.js', 'runner');

    buildDetachedPayload(srcDir, outputDir, 'claude');

    const adaptersDir = path.join(outputDir, 'platforms', 'shared', 'adapters');
    assert.ok(fs.existsSync(path.join(adaptersDir, 'claude-adapter.js')));
    assert.ok(fs.existsSync(path.join(adaptersDir, 'exit-codes.js')));
    assert.ok(fs.existsSync(path.join(adaptersDir, 'conventions.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'gemini-adapter.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'qwen-adapter.js')));
    assert.ok(
      fs.existsSync(path.join(outputDir, 'platforms', 'shared', 'hook-runner.js'))
    );
  });

  it('includes only matching adapter and shared utilities for codex runtime', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'platforms/shared/adapters/claude-adapter.js', 'claude');
    writeFile(srcDir, 'platforms/shared/adapters/gemini-adapter.js', 'gemini');
    writeFile(srcDir, 'platforms/shared/adapters/qwen-adapter.js', 'qwen');
    writeFile(srcDir, 'platforms/shared/adapters/codex-adapter.js', 'codex');
    writeFile(srcDir, 'platforms/shared/adapters/exit-codes.js', 'codes');

    buildDetachedPayload(srcDir, outputDir, 'codex');

    const adaptersDir = path.join(outputDir, 'platforms', 'shared', 'adapters');
    assert.ok(fs.existsSync(path.join(adaptersDir, 'codex-adapter.js')));
    assert.ok(fs.existsSync(path.join(adaptersDir, 'exit-codes.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'claude-adapter.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'gemini-adapter.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'qwen-adapter.js')));
  });

  it('includes all adapter files when runtimeName is omitted', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'platforms/shared/adapters/claude-adapter.js', 'claude');
    writeFile(srcDir, 'platforms/shared/adapters/gemini-adapter.js', 'gemini');
    writeFile(srcDir, 'platforms/shared/adapters/qwen-adapter.js', 'qwen');
    writeFile(srcDir, 'platforms/shared/adapters/exit-codes.js', 'codes');

    buildDetachedPayload(srcDir, outputDir);

    const adaptersDir = path.join(outputDir, 'platforms', 'shared', 'adapters');
    assert.ok(fs.existsSync(path.join(adaptersDir, 'claude-adapter.js')));
    assert.ok(fs.existsSync(path.join(adaptersDir, 'gemini-adapter.js')));
    assert.ok(fs.existsSync(path.join(adaptersDir, 'qwen-adapter.js')));
    assert.ok(fs.existsSync(path.join(adaptersDir, 'exit-codes.js')));
  });

  it('cleans up empty directories after stale file removal', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'orphaned-dir/stale.js', 'stale');

    buildDetachedPayload(srcDir, outputDir);

    assert.ok(!fs.existsSync(path.join(outputDir, 'orphaned-dir')));
  });
});

describe('stampVersion', () => {
  let dirs = [];

  afterEach(() => {
    for (const dir of dirs) {
      cleanupDir(dir);
    }
    dirs = [];
  });

  it('writes version.json to each payload directory', () => {
    const dir1 = createTempDir('maestro-stamp-');
    const dir2 = createTempDir('maestro-stamp-');
    dirs.push(dir1, dir2);

    stampVersion([dir1, dir2], '2.0.0');

    const content1 = JSON.parse(fs.readFileSync(path.join(dir1, 'version.json'), 'utf8'));
    const content2 = JSON.parse(fs.readFileSync(path.join(dir2, 'version.json'), 'utf8'));
    assert.deepStrictEqual(content1, { version: '2.0.0' });
    assert.deepStrictEqual(content2, { version: '2.0.0' });
  });

  it('does not rewrite when content is unchanged', () => {
    const dir = createTempDir('maestro-stamp-');
    dirs.push(dir);

    const versionContent = JSON.stringify({ version: '1.5.0' }, null, 2) + '\n';
    fs.writeFileSync(path.join(dir, 'version.json'), versionContent, 'utf8');
    const mtimeBefore = fs.statSync(path.join(dir, 'version.json')).mtimeMs;

    stampVersion([dir], '1.5.0');

    const mtimeAfter = fs.statSync(path.join(dir, 'version.json')).mtimeMs;
    assert.equal(mtimeBefore, mtimeAfter);
  });

  it('overwrites when content differs', () => {
    const dir = createTempDir('maestro-stamp-');
    dirs.push(dir);

    fs.writeFileSync(
      path.join(dir, 'version.json'),
      JSON.stringify({ version: '1.0.0' }, null, 2) + '\n',
      'utf8'
    );

    stampVersion([dir], '2.0.0');

    const content = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
    assert.deepStrictEqual(content, { version: '2.0.0' });
  });

  it('creates version.json when it does not exist', () => {
    const dir = createTempDir('maestro-stamp-');
    dirs.push(dir);

    stampVersion([dir], '3.0.0');

    assert.ok(fs.existsSync(path.join(dir, 'version.json')));
    const content = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8'));
    assert.deepStrictEqual(content, { version: '3.0.0' });
  });

  it('writes properly formatted JSON with trailing newline', () => {
    const dir = createTempDir('maestro-stamp-');
    dirs.push(dir);

    stampVersion([dir], '4.0.0');

    const raw = fs.readFileSync(path.join(dir, 'version.json'), 'utf8');
    assert.equal(raw, JSON.stringify({ version: '4.0.0' }, null, 2) + '\n');
  });
});
