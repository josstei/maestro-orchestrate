'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const antigravity = require('../../src/platforms/antigravity/runtime-config');
const codex = require('../../src/platforms/codex/runtime-config');
const claude = require('../../src/platforms/claude/runtime-config');
const qwen = require('../../src/platforms/qwen/runtime-config');
const { EXTENSION_ROOT_ENV_VARS } = require('../../src/config/setting-resolver');
const { WORKSPACE_ENV_VARS } = require('../../src/core/project-root-resolver');
const { ROOT } = require('../support/paths');

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
        qwen: 'MAESTRO_WORKSPACE_PATH',
      }
    );
  });

  it('the core resolvers read every runtime workspace variable and the Claude plugin root', () => {
    // core/ and config/ may not import platform configs, so they name the
    // variables themselves; MCP reads env.workspacePath from the config.
    for (const config of [antigravity, claude, codex, qwen]) {
      assert.ok(
        WORKSPACE_ENV_VARS.includes(config.env.workspacePath),
        `${config.name}: env.workspacePath ${config.env.workspacePath} is not in WORKSPACE_ENV_VARS`
      );
    }
    assert.ok(EXTENSION_ROOT_ENV_VARS.includes(claude.env.extensionPath));
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

  it('every hooked runtime serves paths.hooks from its generated hook-runner directory', () => {
    // Host hook registrations name scripts under paths.hooks, and the generator
    // writes the hook-runner launcher to launchers.hookRunner.
    const hooked = [antigravity, claude, codex, qwen].filter((config) => config.launchers.hookRunner);
    assert.deepEqual(hooked.map((config) => config.name), ['antigravity', 'claude', 'qwen']);
    for (const config of hooked) {
      assert.ok(
        config.paths.hooks.endsWith(`${path.posix.dirname(config.launchers.hookRunner)}/`),
        `${config.name}: paths.hooks ${config.paths.hooks} vs launchers.hookRunner ${config.launchers.hookRunner}`
      );
    }
  });

  it('every served path names a directory in its runtime generated output', () => {
    // get_runtime_context serves paths under the host's extension-root
    // variable (Codex's `.` makes them relative), which resolves to the
    // installed copy of outputDir.
    for (const config of [antigravity, claude, codex, qwen]) {
      const root = config.env.extensionPath === '.' ? './' : `\${${config.env.extensionPath}}/`;
      for (const [key, value] of Object.entries(config.paths)) {
        assert.ok(value.startsWith(root), `${config.name}: paths.${key} ${value} is not under ${root}`);
        const dir = path.join(ROOT, config.outputDir, value.slice(root.length));
        assert.ok(
          fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory(),
          `${config.name}: paths.${key} ${value} names no directory in ${config.outputDir}`
        );
      }
    }
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
