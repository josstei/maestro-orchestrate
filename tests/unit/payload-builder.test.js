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
  buildDetachedPayload,
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
  it('is the frozen list of payload src/ prefixes', () => {
    assert.ok(Object.isFrozen(DETACHED_PAYLOAD_BASE_ALLOWLIST));
    assert.deepEqual(DETACHED_PAYLOAD_BASE_ALLOWLIST, [
      'core/',
      'lib/',
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
    ]);
  });
});

describe('shouldIncludeInPayload', () => {
  it('matches files under known allowlisted prefixes', () => {
    const allowlist = DETACHED_PAYLOAD_BASE_ALLOWLIST;
    assert.ok(shouldIncludeInPayload('core/logger.js', allowlist));
    assert.ok(shouldIncludeInPayload('mcp/handlers/workspace.js', allowlist));
    assert.ok(shouldIncludeInPayload('hooks/shared/hook-logic.js', allowlist));
    assert.ok(shouldIncludeInPayload('generated/agent-registry.json', allowlist));
  });

  it('rejects files under non-allowlisted prefixes', () => {
    const allowlist = DETACHED_PAYLOAD_BASE_ALLOWLIST;
    assert.ok(!shouldIncludeInPayload('scripts/generate.js', allowlist));
    assert.ok(!shouldIncludeInPayload('transforms/copy.js', allowlist));
    assert.ok(!shouldIncludeInPayload('manifest.js', allowlist));
    assert.ok(!shouldIncludeInPayload('platforms/claude/runtime-config.js', allowlist));
  });

  it('uses custom allowlist when provided', () => {
    const custom = ['custom/'];
    assert.ok(shouldIncludeInPayload('custom/file.js', custom));
    assert.ok(!shouldIncludeInPayload('core/logger.js', custom));
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

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

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

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'scripts', 'build.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'transforms', 'copy.js')));
  });

  it('removes stale files from the output directory', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'kept');
    writeFile(outputDir, 'core/old-file.js', 'stale');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'old-file.js')));
    assert.equal(stats.removed, 1);
  });

  it('does not rewrite files when content is unchanged', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'same content');
    writeFile(outputDir, 'core/logger.js', 'same content');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.equal(stats.copied, 0);
  });

  it('stamps version.json without counting it as copied or pruning it', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '4.0.0');

    assert.equal(
      fs.readFileSync(path.join(outputDir, 'version.json'), 'utf8'),
      JSON.stringify({ version: '4.0.0' }, null, 2) + '\n'
    );
    assert.deepEqual(stats, { copied: 1, removed: 0 });
  });

  it('does not rewrite version.json when the version is unchanged', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'version.json', JSON.stringify({ version: '1.5.0' }, null, 2) + '\n');
    const mtimeBefore = fs.statSync(path.join(outputDir, 'version.json')).mtimeMs;

    buildDetachedPayload(srcDir, outputDir, 'claude', '1.5.0');

    assert.equal(fs.statSync(path.join(outputDir, 'version.json')).mtimeMs, mtimeBefore);
  });

  it('overwrites version.json when the version differs', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'version.json', JSON.stringify({ version: '1.0.0' }, null, 2) + '\n');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '2.0.0');

    const content = JSON.parse(fs.readFileSync(path.join(outputDir, 'version.json'), 'utf8'));
    assert.deepStrictEqual(content, { version: '2.0.0' });
    assert.equal(stats.removed, 0);
  });

  it('adds runtime-specific platform config to allowlist', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'platforms/claude/runtime-config.js', 'config');
    writeFile(srcDir, 'platforms/codex/runtime-config.js', 'other config');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

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

    buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

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

    buildDetachedPayload(srcDir, outputDir, 'codex', '1.0.0');

    const adaptersDir = path.join(outputDir, 'platforms', 'shared', 'adapters');
    assert.ok(fs.existsSync(path.join(adaptersDir, 'codex-adapter.js')));
    assert.ok(fs.existsSync(path.join(adaptersDir, 'exit-codes.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'claude-adapter.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'gemini-adapter.js')));
    assert.ok(!fs.existsSync(path.join(adaptersDir, 'qwen-adapter.js')));
  });

  it('cleans up empty directories after stale file removal', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(outputDir, 'orphaned-dir/stale.js', 'stale');

    buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.ok(!fs.existsSync(path.join(outputDir, 'orphaned-dir')));
  });
});
