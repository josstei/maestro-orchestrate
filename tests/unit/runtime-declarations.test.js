import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_MCP_SERVER,
  RUNTIME_CONTENT_ROOT,
  getRuntimeDeclaration,
  listRuntimeDeclarations,
  metadataOutputPaths,
} from '../../dist/src/platforms/runtime-declarations.js';
import { RUNTIME_PAYLOAD_CONTRACT } from '../../dist/src/platforms/runtime-payload-contract.js';
import { runtimeConfigNames } from '../support/contracts.js';

describe('runtime declarations', () => {
  it('covers every runtime config exactly once', () => {
    assert.deepEqual(
      listRuntimeDeclarations().map((runtime) => runtime.name).sort(),
      runtimeConfigNames()
    );
  });

  it('centralizes package MCP startup and content root constants', () => {
    assert.deepEqual(PACKAGE_MCP_SERVER.args, ['-y', '-p', '@josstei/maestro@${version}', 'maestro-mcp-server']);
    assert.equal(PACKAGE_MCP_SERVER.entrypoint, 'dist/src/bin/maestro-mcp-server.js');
    assert.deepEqual(RUNTIME_CONTENT_ROOT, { provider: 'registry', srcRoot: 'dist/src' });
  });

  it('drives metadata output paths', () => {
    assert.deepEqual(metadataOutputPaths(), [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'gemini-extension.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'qwen-extension.json',
    ]);
  });

  it('drives runtime payload rows', () => {
    for (const row of RUNTIME_PAYLOAD_CONTRACT) {
      const declaration = getRuntimeDeclaration(row.name);
      assert.ok(declaration, `declaration exists for ${row.name}`);
      assert.equal(row.startup.manifest, declaration.payload.startupManifest);
      assert.deepEqual(row.generatedSurfaces, declaration.payload.generatedSurfaces);
      assert.deepEqual(row.packageInvariants, declaration.payload.packageInvariants);
      assert.deepEqual(row.docs, declaration.payload.docs);
    }
  });
});
