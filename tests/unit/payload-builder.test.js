'use strict';

const { beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DETACHED_PAYLOAD_BASE_ALLOWLIST,
  RUNTIME_PAYLOAD_EXTRAS,
  buildPayloadAllowlist,
  shouldIncludeInPayload,
  buildDetachedPayload,
} = require('../../src/generator/payload-builder');
const { makeTempDir, writeTree } = require('../support/fs');

describe('DETACHED_PAYLOAD_BASE_ALLOWLIST', () => {
  it('is the frozen list of payload src/ prefixes', () => {
    assert.ok(Object.isFrozen(DETACHED_PAYLOAD_BASE_ALLOWLIST));
    assert.deepEqual(DETACHED_PAYLOAD_BASE_ALLOWLIST, [
      'core/',
      'lib/',
      'config/',
      'hooks/',
      'mcp/',
      'platforms/runtime-config-map.js',
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
    assert.ok(shouldIncludeInPayload('platforms/runtime-config-map.js', allowlist));
  });

  it('rejects files under non-allowlisted prefixes', () => {
    const allowlist = DETACHED_PAYLOAD_BASE_ALLOWLIST;
    assert.ok(!shouldIncludeInPayload('scripts/generate.js', allowlist));
    assert.ok(!shouldIncludeInPayload('transforms/copy.js', allowlist));
    assert.ok(!shouldIncludeInPayload('manifest.js', allowlist));
    assert.ok(!shouldIncludeInPayload('platforms/claude/runtime-config.js', allowlist));
    assert.ok(!shouldIncludeInPayload('platforms/metadata.js', allowlist));
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
    const result = buildPayloadAllowlist('qwen');
    assert.equal(result.length, DETACHED_PAYLOAD_BASE_ALLOWLIST.length + 1);
  });

  it('constructs the correct platform path for any runtime', () => {
    const result = buildPayloadAllowlist('test-runtime');
    assert.ok(result.includes('platforms/test-runtime/'));
  });

  it('adds the state scripts to the antigravity payload only', () => {
    // Antigravity serves `node ${PLUGIN_ROOT}/src/scripts/...` from its
    // installed plugin dir, so only its payload carries src/scripts/.
    assert.ok(Object.isFrozen(RUNTIME_PAYLOAD_EXTRAS));
    assert.deepEqual(Object.keys(RUNTIME_PAYLOAD_EXTRAS), ['antigravity']);
    assert.deepEqual(buildPayloadAllowlist('antigravity'), [
      ...DETACHED_PAYLOAD_BASE_ALLOWLIST,
      'platforms/antigravity/',
      'scripts/',
    ]);
    for (const runtimeName of ['claude', 'codex']) {
      assert.ok(!buildPayloadAllowlist(runtimeName).includes('scripts/'), runtimeName);
    }
  });
});

describe('buildDetachedPayload', () => {
  let srcDir;
  let outputDir;

  beforeEach(() => {
    srcDir = makeTempDir('maestro-payload-src-');
    outputDir = makeTempDir('maestro-payload-out-');
  });

  it('copies files matching the allowlist', () => {
    writeTree(srcDir, 'core/logger.js', 'module.exports = {};');
    writeTree(srcDir, 'mcp/server.js', 'module.exports = {};');
    writeTree(srcDir, 'generated/registry.json', '{}');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(fs.existsSync(path.join(outputDir, 'mcp', 'server.js')));
    assert.ok(fs.existsSync(path.join(outputDir, 'generated', 'registry.json')));
    assert.ok(stats.copied >= 3);
  });

  it('skips files not matching the allowlist', () => {
    writeTree(srcDir, 'core/logger.js', 'allowed');
    writeTree(srcDir, 'scripts/build.js', 'disallowed');
    writeTree(srcDir, 'transforms/copy.js', 'disallowed');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'scripts', 'build.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'transforms', 'copy.js')));
  });

  it('removes stale files from the output directory', () => {
    writeTree(srcDir, 'core/logger.js', 'kept');
    writeTree(outputDir, 'core/old-file.js', 'stale');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'logger.js')));
    assert.ok(!fs.existsSync(path.join(outputDir, 'core', 'old-file.js')));
    assert.equal(stats.removed, 1);
  });

  it('does not rewrite files when content is unchanged', () => {
    writeTree(srcDir, 'core/logger.js', 'same content');
    writeTree(outputDir, 'core/logger.js', 'same content');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.equal(stats.copied, 0);
  });

  it('stamps version.json without counting it as copied or pruning it', () => {
    writeTree(srcDir, 'core/logger.js', 'content');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '4.0.0');

    assert.equal(
      fs.readFileSync(path.join(outputDir, 'version.json'), 'utf8'),
      JSON.stringify({ version: '4.0.0' }, null, 2) + '\n'
    );
    assert.deepEqual(stats, { copied: 1, removed: 0 });
  });

  it('does not rewrite version.json when the version is unchanged', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeTree(outputDir, 'version.json', JSON.stringify({ version: '1.5.0' }, null, 2) + '\n');
    const mtimeBefore = fs.statSync(path.join(outputDir, 'version.json')).mtimeMs;

    buildDetachedPayload(srcDir, outputDir, 'claude', '1.5.0');

    assert.equal(fs.statSync(path.join(outputDir, 'version.json')).mtimeMs, mtimeBefore);
  });

  it('overwrites version.json when the version differs', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeTree(outputDir, 'version.json', JSON.stringify({ version: '1.0.0' }, null, 2) + '\n');

    const stats = buildDetachedPayload(srcDir, outputDir, 'claude', '2.0.0');

    const content = JSON.parse(fs.readFileSync(path.join(outputDir, 'version.json'), 'utf8'));
    assert.deepEqual(content, { version: '2.0.0' });
    assert.equal(stats.removed, 0);
  });

  it('copies only the target runtime platform dir', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeTree(srcDir, 'platforms/metadata.js', 'metadata');
    writeTree(srcDir, 'platforms/shared/hook-runner.js', 'runner');
    writeTree(srcDir, 'platforms/claude/runtime-config.js', 'claude config');
    writeTree(srcDir, 'platforms/claude/hook-adapter.js', 'claude adapter');
    writeTree(srcDir, 'platforms/claude/policy-enforcer.js', 'claude enforcer');
    writeTree(srcDir, 'platforms/qwen/runtime-config.js', 'qwen config');
    writeTree(srcDir, 'platforms/qwen/hook-adapter.js', 'qwen adapter');
    writeTree(srcDir, 'platforms/codex/runtime-config.js', 'codex config');

    buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    const platformsDir = path.join(outputDir, 'platforms');
    assert.ok(fs.existsSync(path.join(platformsDir, 'shared', 'hook-runner.js')));
    assert.ok(fs.existsSync(path.join(platformsDir, 'claude', 'runtime-config.js')));
    assert.ok(fs.existsSync(path.join(platformsDir, 'claude', 'hook-adapter.js')));
    assert.ok(fs.existsSync(path.join(platformsDir, 'claude', 'policy-enforcer.js')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'metadata.js')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'qwen')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'codex')));
  });

  it('gives the codex payload its runtime config and no hook adapter', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeTree(srcDir, 'platforms/shared/hook-runner.js', 'runner');
    writeTree(srcDir, 'platforms/codex/runtime-config.js', 'codex config');
    writeTree(srcDir, 'platforms/claude/runtime-config.js', 'claude config');
    writeTree(srcDir, 'platforms/claude/hook-adapter.js', 'claude adapter');
    writeTree(srcDir, 'platforms/qwen/hook-adapter.js', 'qwen adapter');

    buildDetachedPayload(srcDir, outputDir, 'codex', '1.0.0');

    const platformsDir = path.join(outputDir, 'platforms');
    assert.deepEqual(fs.readdirSync(path.join(platformsDir, 'codex')), ['runtime-config.js']);
    assert.ok(fs.existsSync(path.join(platformsDir, 'shared', 'hook-runner.js')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'claude')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'qwen')));
  });

  it('gives the antigravity payload its platform modules and the shared policy enforcer', () => {
    writeTree(srcDir, 'core/policy-rules.js', 'rules');
    writeTree(srcDir, 'platforms/shared/hook-runner.js', 'runner');
    writeTree(srcDir, 'platforms/shared/policy-enforcer.js', 'shared enforcer');
    writeTree(srcDir, 'platforms/antigravity/runtime-config.js', 'antigravity config');
    writeTree(srcDir, 'platforms/antigravity/hook-adapter.js', 'antigravity adapter');
    writeTree(srcDir, 'platforms/antigravity/policy-enforcer.js', 'antigravity enforcer');
    writeTree(srcDir, 'platforms/claude/policy-enforcer.js', 'claude enforcer');

    buildDetachedPayload(srcDir, outputDir, 'antigravity', '1.0.0');

    const platformsDir = path.join(outputDir, 'platforms');
    assert.deepEqual(
      fs.readdirSync(path.join(platformsDir, 'antigravity')).sort(),
      ['hook-adapter.js', 'policy-enforcer.js', 'runtime-config.js']
    );
    assert.deepEqual(
      fs.readdirSync(path.join(platformsDir, 'shared')).sort(),
      ['hook-runner.js', 'policy-enforcer.js']
    );
    assert.ok(fs.existsSync(path.join(outputDir, 'core', 'policy-rules.js')));
    assert.ok(!fs.existsSync(path.join(platformsDir, 'claude')));
  });

  it('cleans up empty directories after stale file removal', () => {
    writeTree(srcDir, 'core/logger.js', 'content');
    writeTree(outputDir, 'orphaned-dir/stale.js', 'stale');

    buildDetachedPayload(srcDir, outputDir, 'claude', '1.0.0');

    assert.ok(!fs.existsSync(path.join(outputDir, 'orphaned-dir')));
  });
});
