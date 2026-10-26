'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planDetachedPayload } = require('../../src/generator/payload-builder');
const { getRuntimeConfig } = require('../../src/platforms/runtime-config-map');
const { makeTempDir, writeJson, writeTree } = require('../support/fs');
const { SRC_ROOT } = require('../support/paths');

const REQUIRED_STATE_SCRIPTS = [
  'ensure-workspace.js',
  'read-active-session.js',
  'read-setting.js',
  'read-state.js',
  'write-state.js',
];

function sourceFixture() {
  const src = makeTempDir('maestro-payload-source-');
  writeTree(src, 'mcp/maestro-server.js', "require('../core/runtime');\n");
  writeTree(src, 'core/runtime.js', "module.exports = 'runtime';\n");
  for (const runtime of ['antigravity', 'claude', 'codex']) {
    writeTree(src, `platforms/${runtime}/runtime-config.js`, 'module.exports = {};\n');
    if (runtime !== 'codex') writeTree(src, `platforms/${runtime}/hook-adapter.js`, 'module.exports = {};\n');
  }
  writeTree(src, 'platforms/shared/hook-runner.js', 'module.exports = {};\n');
  writeTree(src, 'platforms/shared/policy-enforcer.js', 'module.exports = {};\n');
  for (const script of REQUIRED_STATE_SCRIPTS) writeTree(src, `scripts/${script}`, "require('../core/runtime');\n");
  writeJson(path.join(src, 'generated/agent-registry.json'), [{ name: 'coder', capabilities: 'full' }]);
  writeJson(path.join(src, 'generated/resource-registry.json'), { plan: 'templates/plan.md' });
  writeJson(path.join(src, 'generated/hook-registry.json'), { after: { module: 'hooks/after.js', fn: 'after' } });
  writeTree(src, 'agents/coder.md', '# Coder\n');
  writeTree(src, 'agents/shared/handoff-report.md', '# Handoff\n');
  writeTree(src, 'templates/plan.md', '# Plan\n');
  writeTree(src, 'hooks/after.js', 'module.exports = {};\n');
  return src;
}

function plan(src, runtime = 'codex', version = '1.2.3', options = {}) {
  const { outputs } = planDetachedPayload(src, getRuntimeConfig(runtime), version, options);
  return { outputs, files: new Set(outputs.map(({ outputPath }) => outputPath)) };
}

describe('detached payload dependency plans', () => {
  it('preserves runtime entrypoints, every catalog asset and all five state CLIs in real payloads', () => {
    for (const runtime of ['antigravity', 'claude', 'codex']) {
      const { files } = plan(SRC_ROOT, runtime);
      assert.ok(files.has('mcp/maestro-server.js'));
      assert.ok(files.has(`platforms/${runtime}/runtime-config.js`));
      assert.ok(files.has('core/stdin-reader.js'), 'write-state CLI reads stdin');
      for (const script of REQUIRED_STATE_SCRIPTS) assert.ok(files.has(`scripts/${script}`));
      const resources = JSON.parse(fs.readFileSync(path.join(SRC_ROOT, 'generated/resource-registry.json')));
      for (const file of Object.values(resources)) assert.ok(files.has(file), file);
      const agents = JSON.parse(fs.readFileSync(path.join(SRC_ROOT, 'generated/agent-registry.json')));
      for (const agent of agents) assert.ok(files.has(`agents/${agent.name}.md`));
      assert.ok(files.has('agents/shared/handoff-report.md'));
      for (const file of ['lib/discovery/index.js', 'lib/yaml-emit.js', 'generator/dependency-graph.js']) {
        assert.ok(!files.has(file), `${runtime} must not ship build-only ${file}`);
      }
      assert.equal(files.has('core/policy-rules.js'), runtime !== 'codex');
      assert.equal(files.has('generated/hook-registry.json'), runtime !== 'codex');
      assert.equal([...files].some((file) => file.startsWith('hooks/')), runtime !== 'codex');
      for (const other of ['antigravity', 'claude', 'codex', 'qwen'].filter((name) => name !== runtime)) {
        assert.ok(![...files].some((file) => file.startsWith(`platforms/${other}/`)));
      }
    }
  });

  it('follows new transitive dependencies without copying unrelated source', () => {
    const src = sourceFixture();
    writeTree(src, 'core/runtime.js', "require('../lib/new-module');\n");
    writeTree(src, 'lib/new-module.js', 'module.exports = 42;\n');
    writeTree(src, 'lib/dead.js', 'this is invalid JavaScript and must not be parsed');
    const result = plan(src);
    assert.ok(result.files.has('lib/new-module.js'));
    assert.ok(!result.files.has('lib/dead.js'));
    assert.equal(result.outputs.find((output) => output.outputPath === 'lib/new-module.js').content, 'module.exports = 42;\n');
    assert.match(result.outputs.find((output) => output.outputPath === 'lib/new-module.js').reason, /core\/runtime\.js/);
  });

  it('uses fresh in-memory registries without rewriting source', () => {
    const src = sourceFixture();
    writeTree(src, 'templates/fresh.md', '# Fresh\n');
    const resourcePath = path.join(src, 'generated/resource-registry.json');
    const before = fs.readFileSync(resourcePath, 'utf8');
    const sourceOverrides = new Map([['generated/resource-registry.json', JSON.stringify({ fresh: 'templates/fresh.md' })]]);
    const result = plan(src, 'codex', '9.8.7', { sourceOverrides });
    assert.ok(result.files.has('templates/fresh.md'));
    assert.ok(!result.files.has('templates/plan.md'));
    assert.equal(fs.readFileSync(resourcePath, 'utf8'), before);
    assert.equal(result.outputs.find((output) => output.outputPath === 'version.json').content, '{\n  "version": "9.8.7"\n}\n');
  });

  it('keeps every registered hook handler even when host metadata does not register that event', () => {
    const result = plan(sourceFixture(), 'antigravity');
    assert.ok(result.files.has('hooks/after.js'));
  });

  it('rejects missing assets, unknown computed imports and dependencies outside canonical source', () => {
    const src = sourceFixture();
    writeJson(path.join(src, 'generated/resource-registry.json'), { missing: 'templates/missing.md' });
    assert.throws(() => plan(src), /ENOENT/);
    writeJson(path.join(src, 'generated/resource-registry.json'), {});
    writeTree(src, 'core/runtime.js', 'require(process.env.MODULE);\n');
    assert.throws(() => plan(src), /Invalid codex payload dependencies/);
    writeTree(src, 'core/runtime.js', "require('../../outside.js');\n");
    assert.throws(() => plan(src), /Invalid codex payload dependencies/);
  });

  it('rejects registry paths and symlinks that escape canonical source', () => {
    const src = sourceFixture();
    writeJson(path.join(src, 'generated/resource-registry.json'), { escape: '../outside.md' });
    assert.throws(() => plan(src), /Path traversal detected/);
    const external = makeTempDir('maestro-payload-external-');
    writeTree(external, 'secret.md', 'not payload content');
    fs.symlinkSync(path.join(external, 'secret.md'), path.join(src, 'templates/link.md'));
    writeJson(path.join(src, 'generated/resource-registry.json'), { escape: 'templates/link.md' });
    assert.throws(() => plan(src), /Symlink path is not allowed/);
    fs.symlinkSync(path.join(src, 'templates/plan.md'), path.join(src, 'templates/internal-link.md'));
    writeJson(path.join(src, 'generated/resource-registry.json'), { alias: 'templates/internal-link.md' });
    assert.throws(() => plan(src), /Symlink path is not allowed/);
  });

  it('produces deterministic sorted plans with an explanation for every file', () => {
    const src = sourceFixture();
    const first = plan(src);
    const second = plan(src);
    assert.deepEqual(first.outputs, second.outputs);
    assert.ok(first.outputs.every((output) => typeof output.reason === 'string' && output.reason.length > 0));
    assert.deepEqual(first.outputs.map((output) => output.outputPath), [...first.files].sort());
    assert.throws(() => plan(src, 'qwen'), /Unknown detached payload runtime: qwen/);
  });
});
