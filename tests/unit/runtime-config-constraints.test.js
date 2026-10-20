'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const antigravity = require('../../src/platforms/antigravity/runtime-config');
const codex = require('../../src/platforms/codex/runtime-config');
const claude = require('../../src/platforms/claude/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');

const RUNTIME_CONFIGS = { antigravity, claude, codex, qwen };

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === 'string' && value.length > 0;

describe('runtime-config required fields', () => {
  // Consumers (MCP server, content serving, generator) read these fields
  // without a fallback. agentPrefix, mcpToolMeta and agentFrontmatter are
  // optional.
  it('every runtime-config defines the fields its consumers read without a fallback', () => {
    for (const [name, config] of Object.entries(RUNTIME_CONFIGS)) {
      assert.equal(config.name, name);
      assert.ok(isNonEmptyString(config.outputDir), `${name}.outputDir`);
      assert.ok(['kebab-case', 'snake_case'].includes(config.agentNaming), `${name}.agentNaming`);
      assert.ok(Array.isArray(config.mcpClientNames) && config.mcpClientNames.length > 0, `${name}.mcpClientNames`);
      assert.equal(typeof config.mcpPrefix, 'string', `${name}.mcpPrefix`);
      assert.equal(typeof config.planModeNative, 'boolean', `${name}.planModeNative`);
      assert.ok(isNonEmptyString(config.env.extensionPath), `${name}.env.extensionPath`);
      assert.ok(isNonEmptyString(config.env.workspacePath), `${name}.env.workspacePath`);
      assert.ok(isPlainObject(config.tools), `${name}.tools`);
      assert.ok(isNonEmptyString(config.delegation.pattern), `${name}.delegation.pattern`);
      assert.ok(isPlainObject(config.delegation.constraints), `${name}.delegation.constraints`);
      assert.ok(isPlainObject(config.paths), `${name}.paths`);
      assert.ok(isPlainObject(config.features), `${name}.features`);
      for (const [flag, enabled] of Object.entries(config.features)) {
        assert.equal(typeof enabled, 'boolean', `${name}.features.${flag}`);
      }
    }
  });

  it('every runtime-config declares the same feature flags', () => {
    const flags = Object.keys(codex.features).sort();
    for (const [name, config] of Object.entries(RUNTIME_CONFIGS)) {
      assert.deepEqual(Object.keys(config.features).sort(), flags, name);
    }
  });
});

describe('runtime-config host bindings', () => {
  it('every runtime-config binds workspacePath to the env var its host provides', () => {
    assert.deepEqual(
      {
        antigravity: antigravity.env.workspacePath,
        claude: claude.env.workspacePath,
        codex: codex.env.workspacePath,
        qwen: qwen.env.workspacePath,
      },
      {
        antigravity: 'MAESTRO_WORKSPACE_PATH',
        claude: 'CLAUDE_PROJECT_DIR',
        codex: 'MAESTRO_WORKSPACE_PATH',
        qwen: 'workspacePath',
      }
    );
  });

  it('every runtime-config roots its generated output in the directory its host loads', () => {
    // Qwen Code loads subagents from <extension>/agents/, and the repo root
    // (where qwen-extension.json lives) is Qwen's extension dir. `agy plugin
    // install` copies the single antigravity/ plugin directory.
    assert.deepEqual(
      {
        antigravity: antigravity.outputDir,
        claude: claude.outputDir,
        codex: codex.outputDir,
        qwen: qwen.outputDir,
      },
      {
        antigravity: 'antigravity/',
        claude: 'claude/',
        codex: 'plugins/maestro/',
        qwen: './',
      }
    );
  });

  it('only antigravity marks its MCP tools always-loaded', () => {
    // Antigravity registers a tool marked antigravity/alwaysLoad as the native
    // tool mcp_maestro_maestro_<tool> instead of loading it on demand.
    assert.deepEqual(antigravity.mcpToolMeta, { 'antigravity/alwaysLoad': true });
    assert.equal(antigravity.mcpPrefix, 'mcp_maestro_maestro_');
    for (const config of [claude, codex, qwen]) {
      assert.equal(config.mcpToolMeta, undefined, config.name);
    }
  });
});
