import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.js';

describe('thin entrypoint design', () => {
  it('each MCP entrypoint sets its own MAESTRO_RUNTIME default', () => {
    const expectations = [
      { file: 'mcp/maestro-server.js', runtime: 'gemini' },
      { file: 'claude/mcp/maestro-server.js', runtime: 'claude' },
      { file: 'src/bin/maestro-mcp-server.ts', runtime: 'codex' },
    ];

    for (const { file, runtime } of expectations) {
      const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.ok(
        content.includes(`'${runtime}'`),
        `Expected ${file} to default MAESTRO_RUNTIME to '${runtime}'`
      );
    }
  });

  it('Claude entrypoint uses compiled runtime resolution only', () => {
    const content = fs.readFileSync(path.join(ROOT, 'claude/mcp/maestro-server.js'), 'utf8');
    assert.ok(
      content.includes("'dist', 'src', 'mcp', 'maestro-server.js'"),
      'Expected claude/mcp/maestro-server.js to resolve the compiled dist server'
    );
    assert.ok(
      !content.includes("from '../../src/mcp/maestro-server.js'"),
      'Expected claude/mcp/maestro-server.js to stop importing package-root src directly'
    );
    assert.ok(
      !content.includes("'..', '..', 'src', 'mcp', 'maestro-server.js'"),
      'Expected claude/mcp/maestro-server.js to remove package-root src fallback candidates'
    );
  });

  it('Gemini entrypoint uses compiled runtime resolution only', () => {
    const content = fs.readFileSync(path.join(ROOT, 'mcp/maestro-server.js'), 'utf8');
    assert.ok(
      content.includes("'dist', 'src', 'mcp', 'maestro-server.js'"),
      'Expected Gemini entrypoint to resolve the compiled dist server'
    );
    assert.ok(
      !content.includes("from '../src/mcp/maestro-server.js'"),
      'Expected Gemini entrypoint to stop importing package-root src directly'
    );
    assert.ok(
      !content.includes("'..', 'src', 'mcp', 'maestro-server.js'"),
      'Expected Gemini entrypoint to remove package-root src fallback candidates'
    );
  });

  it('no canonical-source.js copies exist outside src/core/', () => {
    const forbiddenLocations = [
      'hooks/canonical-source.js',
      'mcp/canonical-source.js',
      'claude/scripts/canonical-source.js',
      'claude/mcp/canonical-source.js',
    ];

    for (const file of forbiddenLocations) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        false,
        `Expected ${file} to NOT exist (replaced by thin entrypoints)`
      );
    }
  });

  it('generated platform metadata exists at final locations', () => {
    const requiredFiles = [
      '.agents/plugins/marketplace.json',
      '.claude-plugin/marketplace.json',
      '.claude-plugin/plugin.json',
      'claude/.mcp.json',
      'claude/hooks/claude-hooks.json',
      'plugins/maestro/.codex-plugin/plugin.json',
      'plugins/maestro/.mcp.json',
      'GEMINI.md',
      'gemini-extension.json',
      'hooks/hooks.json',
      'qwen-extension.json',
    ];

    for (const file of requiredFiles) {
      assert.equal(
        fs.existsSync(path.join(ROOT, file)),
        true,
        `Expected generated platform metadata ${file} to exist`
      );
    }
  });
});
