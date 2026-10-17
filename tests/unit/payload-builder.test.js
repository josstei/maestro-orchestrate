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

describe('buildPayloadAllowlist', () => {
  it('extends the base allowlist with the runtime platform dir', () => {
    const result = buildPayloadAllowlist('claude');
    assert.ok(result.includes('platforms/claude/'));
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
    assert.ok(result.includes('platforms/test-runtime/'));
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

  it('copies only the target runtime platform dir', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'platforms/metadata.js', 'metadata');
    writeFile(srcDir, 'platforms/shared/hook-runner.js', 'runner');
    writeFile(srcDir, 'platforms/claude/runtime-config.js', 'claude config');
    writeFile(srcDir, 'platforms/claude/hook-adapter.js', 'claude adapter');
    writeFile(srcDir, 'platforms/claude/policy-enforcer.js', 'claude enforcer');
    writeFile(srcDir, 'platforms/gemini/runtime-config.js', 'gemini config');
    writeFile(srcDir, 'platforms/gemini/hook-adapter.js', 'gemini adapter');
    writeFile(srcDir, 'platforms/codex/runtime-config.js', 'codex config');

    buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    const platformsDir = path.join(outputDir, 'platforms');
    assert.ok(fs.existsSync(path.join(platformsDir, 'shared', 'hook-runner.js')));
    assert.ok(fs.existsSync(path.join(platformsDir, 'claude', 'runtime-config.js')));
    assert.ok(fs.existsSync(path.join(platformsDir, 'claude', 'hook-adapter.js')));
    assert.ok(fs.existsSync(path.join(platformsDir, 'claude', 'policy-enforcer.js')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'metadata.js')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'gemini')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'codex')));
  });

  it('gives the codex payload its runtime config and no hook adapter', () => {
    srcDir = createTempDir('maestro-payload-src-');
    outputDir = createTempDir('maestro-payload-out-');

    writeFile(srcDir, 'core/logger.js', 'content');
    writeFile(srcDir, 'platforms/shared/hook-runner.js', 'runner');
    writeFile(srcDir, 'platforms/codex/runtime-config.js', 'codex config');
    writeFile(srcDir, 'platforms/claude/runtime-config.js', 'claude config');
    writeFile(srcDir, 'platforms/claude/hook-adapter.js', 'claude adapter');
    writeFile(srcDir, 'platforms/qwen/hook-adapter.js', 'qwen adapter');

    buildDetachedPayload(srcDir, outputDir, 'codex', '1.0.0');

    const platformsDir = path.join(outputDir, 'platforms');
    assert.deepEqual(fs.readdirSync(path.join(platformsDir, 'codex')), ['runtime-config.js']);
    assert.ok(fs.existsSync(path.join(platformsDir, 'shared', 'hook-runner.js')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'claude')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'qwen')));
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
