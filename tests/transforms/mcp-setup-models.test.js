'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { handleSetupModels } = require('../../src/mcp/handlers/setup-models');
const { KNOWN_AGENTS } = require('../../src/core/agent-registry');

// Mock atomicWriteSync to avoid real file writes if necessary, 
// but handleSetupModels uses it from ../../core/atomic-write
// For these tests, we'll use a real temporary directory to ensure everything works as expected.

// Mock MAESTRO_EXTENSION_PATH to the actual repo root during tests
const REPO_ROOT = path.resolve(__dirname, '../../');
process.env.MAESTRO_EXTENSION_PATH = REPO_ROOT;

describe('handleSetupModels', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-test-'));
  const dotGemini = path.join(tempDir, '.gemini');
  const settingsPath = path.join(dotGemini, 'settings.json');

  it('should return skipped_model_setup when mode is skip', async () => {
    const result = await handleSetupModels({ mode: 'skip' }, tempDir);
    assert.deepEqual(result, { status: 'skipped_model_setup' });
  });

  it('should throw if mode is invalid', async () => {
    await assert.rejects(
      () => handleSetupModels({ mode: 'invalid' }, tempDir),
      /Invalid mode: invalid/
    );
  });

  it('should create a fresh settings file if it does not exist', async () => {
    if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
    if (!fs.existsSync(dotGemini)) fs.mkdirSync(dotGemini, { recursive: true });

    const result = await handleSetupModels({ mode: 'balanced' }, tempDir);
    assert.equal(result.status, 'success');
    assert.equal(result.mode, 'balanced');

    assert.ok(fs.existsSync(settingsPath));
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(settings.experimental.enableAgents, true);
    assert.ok(settings.agents.overrides);
    assert.ok(settings.agents.overrides.architect);
  });

  it('should preserve existing settings properties after merge', async () => {
    const existingSettings = {
      existingProp: 'value',
      experimental: {
        otherProp: true
      },
      agents: {
        overrides: {
          architect: {
            customProp: 'custom'
          }
        }
      }
    };
    fs.writeFileSync(settingsPath, JSON.stringify(existingSettings));

    const result = await handleSetupModels({ mode: 'quality' }, tempDir);
    assert.equal(result.status, 'success');

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert.equal(settings.existingProp, 'value');
    assert.equal(settings.experimental.otherProp, true);
    assert.equal(settings.experimental.enableAgents, true);
    assert.equal(settings.agents.overrides.architect.customProp, 'custom');
    assert.ok(settings.agents.overrides.architect.modelConfig.model);
  });

  it('should throw meaningful error if settings file is corrupted', async () => {
    fs.writeFileSync(settingsPath, 'corrupted json {');
    await assert.rejects(
      () => handleSetupModels({ mode: 'balanced' }, tempDir),
      /Existing .gemini\/settings.json is corrupted/
    );
  });

  it('should throw meaningful error if agent-modes.json is missing', async () => {
    const originalPath = process.env.MAESTRO_EXTENSION_PATH;
    process.env.MAESTRO_EXTENSION_PATH = '/non/existent/path';
    try {
      await assert.rejects(
        () => handleSetupModels({ mode: 'balanced' }, tempDir),
        /Failed to read agent-modes.json/
      );
    } finally {
      process.env.MAESTRO_EXTENSION_PATH = originalPath;
    }
  });

  after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

describe('agent-modes.json validation', () => {
  it('should ensure all agents in all modes exist in KNOWN_AGENTS', () => {
    const modesPath = path.resolve(__dirname, '../../src/config/agent-modes.json');
    const modes = JSON.parse(fs.readFileSync(modesPath, 'utf8'));

    for (const [mode, mapping] of Object.entries(modes)) {
      for (const agent of Object.keys(mapping)) {
        assert.ok(
          KNOWN_AGENTS.includes(agent),
          `Agent "${agent}" in mode "${mode}" is not in KNOWN_AGENTS`
        );
      }
    }
  });
});
