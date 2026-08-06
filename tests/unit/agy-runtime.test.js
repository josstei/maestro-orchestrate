import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AGY_RUNTIME_CONFIG } from '../../dist/src/platforms/agy/runtime-config.js';
import { agyAdapter } from '../../dist/src/platforms/shared/adapters/agy-adapter.js';
import { getRuntimeDefinition } from '../../dist/src/platforms/runtime-declarations.js';

test('AGY_RUNTIME_CONFIG has expected properties', () => {
  assert.equal(AGY_RUNTIME_CONFIG.name, 'agy');
  assert.equal(AGY_RUNTIME_CONFIG.outputDir, 'agy/');
  assert.equal(AGY_RUNTIME_CONFIG.mcpPrefix, 'mcp_maestro_');
  assert.equal(AGY_RUNTIME_CONFIG.contextFile.outputPath, 'AGY.md');
  assert.equal(AGY_RUNTIME_CONFIG.contextFile.commandDir, 'commands/agy');
  assert.equal(AGY_RUNTIME_CONFIG.contextFile.commandNamespace, 'maestro');
  assert.equal(AGY_RUNTIME_CONFIG.contextFile.extensionManifest, 'agy-extension.json');
  assert.equal(AGY_RUNTIME_CONFIG.contextFile.hooksConfigPath, 'agy/hooks.json');
});

test('getRuntimeDefinition("agy") returns registered AGY runtime definition', () => {
  const def = getRuntimeDefinition('agy');
  assert.notEqual(def, null);
  assert.equal(def?.name, 'agy');
  assert.equal(def?.metadata.extensionManifest?.outputPath, 'agy-extension.json');
  assert.equal(def?.metadata.extensionManifest?.contextFileName, 'AGY.md');
});

test('agyAdapter normalizes stdin and stdout correctly', () => {
  assert.equal(agyAdapter.name, 'agy');
  const input = { session_id: 'test-123', prompt: 'Agent: coder\nTask' };
  const normalized = agyAdapter.normalizeInput(input);
  assert.equal(normalized.sessionId, 'test-123');
});
