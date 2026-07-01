'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createHandler: createAgentHandler } = require('../../src/mcp/handlers/get-agent');
const { createHandler: createSkillContentHandler } = require('../../src/mcp/handlers/get-skill-content');
const { getRuntimeConfig } = require('../../src/mcp/runtime/runtime-config-map');
const {
  RUNTIME_PAYLOAD_CONTRACT,
  TOPOLOGY_DECISION,
  getRuntimePayloadContract,
} = require('../../src/platforms/runtime-payload-contract');

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const PACKAGE_VERSION = require('../../package.json').version;

function runtimeConfigNames() {
  return fs.readdirSync(path.join(SRC, 'platforms'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
    .filter((entry) => fs.existsSync(path.join(SRC, 'platforms', entry.name, 'runtime-config.js')))
    .map((entry) => entry.name)
    .sort();
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function expectedStartupArgs(runtime) {
  return runtime.startup.args.map((arg) => arg.replace('${version}', PACKAGE_VERSION));
}

function readManifestServer(runtime) {
  const manifest = readJson(runtime.startup.manifest);
  const server = manifest.mcpServers && manifest.mcpServers.maestro;

  assert.ok(server, `${runtime.name} manifest must define maestro MCP server`);
  return server;
}

describe('runtime payload contract', () => {
  it('records the live JS source-first topology decision for Phase 0', () => {
    assert.equal(TOPOLOGY_DECISION.mode, 'live-js-source-first');
    assert.equal(TOPOLOGY_DECISION.canonicalSource, 'src/**/*.js');
    assert.match(TOPOLOGY_DECISION.note, /TypeScript\/dist topology/);
  });

  it('covers every runtime config exactly once', () => {
    const contractNames = RUNTIME_PAYLOAD_CONTRACT.map((runtime) => runtime.name).sort();

    assert.deepEqual(contractNames, runtimeConfigNames());
    for (const runtimeName of contractNames) {
      assert.equal(getRuntimePayloadContract(runtimeName).name, runtimeName);
    }
  });

  it('points to existing startup files, docs, and package invariants', () => {
    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      assert.ok(fs.existsSync(path.join(ROOT, runtime.startup.manifest)), `${runtime.name} manifest exists`);
      assert.ok(fs.existsSync(path.join(ROOT, runtime.startup.entrypoint)), `${runtime.name} entrypoint exists`);

      for (const invariantPath of runtime.packageInvariants) {
        assert.ok(
          fs.existsSync(path.join(ROOT, invariantPath)),
          `${runtime.name} package invariant exists: ${invariantPath}`
        );
      }

      for (const docPath of runtime.docs) {
        assert.ok(fs.existsSync(path.join(ROOT, docPath)), `${runtime.name} doc exists: ${docPath}`);
      }

      if (runtime.detachedPayload.path) {
        assert.ok(
          fs.existsSync(path.join(ROOT, runtime.detachedPayload.path)),
          `${runtime.name} detached payload exists`
        );
        assert.ok(
          fs.existsSync(path.join(ROOT, runtime.detachedPayload.versionFile)),
          `${runtime.name} detached payload version exists`
        );
      }
    }
  });

  it('keeps generated startup manifests aligned with the runtime startup contract', () => {
    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      const server = readManifestServer(runtime);

      assert.equal(server.command, runtime.startup.command, `${runtime.name} startup command`);
      assert.deepEqual(server.args, expectedStartupArgs(runtime), `${runtime.name} startup args`);
      assert.ok(fs.existsSync(path.join(ROOT, runtime.startup.entrypoint)), `${runtime.name} startup entrypoint`);
    }
  });

  it('records Codex as package-root src only with no detached payload', () => {
    const codex = getRuntimePayloadContract('codex');

    assert.equal(codex.content.srcRoot, 'src');
    assert.equal(codex.detachedPayload.requiredForStartup, false);
    assert.equal(codex.detachedPayload.requiredForRelease, false);
    assert.equal(codex.detachedPayload.path, null);
    assert.equal(
      codex.packageInvariants.some((invariantPath) => invariantPath.startsWith('plugins/maestro/src')),
      false
    );
  });

  it('records Claude as package-root src only with no detached payload', () => {
    const claude = getRuntimePayloadContract('claude');
    const runtimeConfig = getRuntimeConfig('claude');

    assert.equal(claude.content.srcRoot, 'src');
    assert.equal(claude.content.fallback, 'none');
    assert.equal(runtimeConfig.content.primary, 'filesystem');
    assert.equal(runtimeConfig.content.fallback, claude.content.fallback);
    assert.equal(claude.detachedPayload.requiredForStartup, false);
    assert.equal(claude.detachedPayload.requiredForRelease, false);
    assert.equal(claude.detachedPayload.path, null);
  });

  it('does not classify canonical src as a generated runtime surface', () => {
    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      assert.equal(
        runtime.generatedSurfaces.includes('src/'),
        false,
        `${runtime.name} should not list canonical src/ as generated`
      );
    }
  });

  it('keeps runtime content lookup working for every runtime', () => {
    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      const runtimeConfig = getRuntimeConfig(runtime.name);
      const contentRoot = path.join(ROOT, runtime.content.srcRoot);
      const skillHandler = createSkillContentHandler(runtimeConfig, contentRoot);
      const agentHandler = createAgentHandler(runtimeConfig, contentRoot);

      const skillResult = skillHandler({ resources: ['delegation'] });
      const agentResult = agentHandler({ agents: ['coder'] });

      assert.deepEqual(skillResult.errors, {}, `${runtime.name} skill lookup errors`);
      assert.match(skillResult.contents.delegation, /delegation/i, `${runtime.name} skill content`);
      assert.deepEqual(agentResult.errors, {}, `${runtime.name} agent lookup errors`);
      assert.ok(agentResult.agents.coder.body.length > 100, `${runtime.name} agent body`);
      assert.ok(agentResult.agents.coder.tools.length > 0, `${runtime.name} agent tools`);
      if (runtime.name === 'claude') {
        assert.ok(
          skillResult.contents.delegation.includes('user-invocable: false'),
          'claude detached skill content keeps runtime metadata transform'
        );
      }
    }
  });
});
