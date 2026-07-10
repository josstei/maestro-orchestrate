import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { handleGetAgent } from '../../dist/src/mcp/handlers/get-agent.js';
import { handleGetSkillContent } from '../../dist/src/mcp/handlers/get-skill-content.js';
import { getRuntimeConfig } from '../../dist/src/mcp/runtime/runtime-config-map.js';
import {
  RUNTIME_PAYLOAD_CONTRACT,
  TOPOLOGY_DECISION,
  assertRuntimePayloadContract,
  getRuntimePayloadContract,
  runtimePayloadContractIssues,
} from '../../dist/src/tooling/runtime-payload-contract.js';
import { RUNTIME_PACKAGE_INVARIANTS } from '../../dist/src/tooling/artifact-policy.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runtimeConfigNames } from '../support/contracts.js';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
const PACKAGE_VERSION = packageJson.version;

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
  it('cross-checks catalog facts against independently authored policy', () => {
    assert.deepEqual(runtimePayloadContractIssues(), []);
    assert.doesNotThrow(() => assertRuntimePayloadContract());

    const { gemini: _gemini, ...withoutGemini } = RUNTIME_PACKAGE_INVARIANTS;
    assert.deepEqual(runtimePayloadContractIssues({ invariants: withoutGemini }), [
      'gemini: missing independently authored package invariants',
    ]);
    assert.throws(
      () => assertRuntimePayloadContract({ npmProjection: [] }),
      /package invariant is absent from npm projection/
    );
  });

  it('records the source-only generated dist topology decision', () => {
    assert.equal(TOPOLOGY_DECISION.mode, 'source-only-generated-dist');
    assert.match(TOPOLOGY_DECISION.canonicalSource, /src\/\*\*\/\*\.ts/);
    assert.match(TOPOLOGY_DECISION.runtimeFormat, /dist\/src/);
    assert.match(TOPOLOGY_DECISION.note, /does not track dist\/src/);
    assert.match(TOPOLOGY_DECISION.note, /dist\/src runtime entries/);
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
    }
  });

  for (const entry of RUNTIME_PAYLOAD_CONTRACT) {
    it(`${entry.name} carries no retired payload/fallback keys`, () => {
      assert.equal(entry.detachedPayload, undefined);
      assert.equal(entry.content && entry.content.fallback, undefined);
    });
  }

  it('keeps generated startup manifests aligned with the runtime startup contract', () => {
    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      const server = readManifestServer(runtime);

      assert.equal(server.command, runtime.startup.command, `${runtime.name} startup command`);
      assert.deepEqual(server.args, expectedStartupArgs(runtime), `${runtime.name} startup args`);
      assert.ok(fs.existsSync(path.join(ROOT, runtime.startup.entrypoint)), `${runtime.name} startup entrypoint`);
    }
  });

  it('records Codex as dist-only package runtime content', () => {
    const codex = getRuntimePayloadContract('codex');

    assert.equal(codex.content.provider, 'registry');
    assert.equal(codex.content.srcRoot, 'dist/src');
    assert.ok(codex.packageInvariants.includes('dist/src/bin/maestro-mcp-server.js'));
    assert.ok(codex.packageInvariants.includes('dist/src/mcp/maestro-server.js'));
    assert.equal(
      codex.packageInvariants.some((invariantPath) => invariantPath.startsWith('src/')),
      false
    );
    assert.equal(
      codex.packageInvariants.some((invariantPath) => invariantPath.startsWith('plugins/maestro/src')),
      false
    );
  });

  it('records Claude as dist-only package runtime content', () => {
    const claude = getRuntimePayloadContract('claude');

    assert.equal(claude.content.provider, 'registry');
    assert.equal(claude.content.srcRoot, 'dist/src');
    assert.ok(claude.packageInvariants.includes('dist/src/bin/maestro-mcp-server.js'));
    assert.ok(claude.packageInvariants.includes('dist/src/mcp/maestro-server.js'));
    assert.equal(
      claude.packageInvariants.some((invariantPath) => invariantPath.startsWith('src/')),
      false
    );
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

  it('ships generated registry content instead of raw dist content directories', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/src/generated/runtime-content-registry.json')));
    assert.ok(fs.existsSync(path.join(ROOT, 'dist/src/generated/runtime-content-registry.txt.gz')));

    for (const retiredRoot of ['agents', 'references', 'skills', 'templates']) {
      assert.equal(
        fs.existsSync(path.join(ROOT, 'dist/src', retiredRoot)),
        false,
        `dist/src/${retiredRoot} should not be shipped as raw runtime content`
      );
    }
  });

  it('keeps runtime content lookup working for every runtime', () => {
    for (const runtime of RUNTIME_PAYLOAD_CONTRACT) {
      const runtimeConfig = getRuntimeConfig(runtime.name);
      const contentRoot = path.join(ROOT, runtime.content.srcRoot);
      const skillHandler = (params) => handleGetSkillContent(params, { runtimeConfig, services: { canonicalSrcRoot: contentRoot } });
      const agentHandler = (params) => handleGetAgent(params, { runtimeConfig, services: { canonicalSrcRoot: contentRoot } });

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
