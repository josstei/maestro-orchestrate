const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DRY_RUN_MARKER,
  getGitStatus,
  parseDryRunReport,
  ROOT,
  runGenerator,
} = require('./helpers');

describe('generator integration', () => {
  it('--dry-run reports manifest status without mutating the worktree', () => {
    const beforeStatus = getGitStatus();
    const result = runGenerator(['--dry-run']);
    const afterStatus = getGitStatus();
    const report = parseDryRunReport(result);

    assert.equal(afterStatus, beforeStatus);
    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected dry-run to report manifest output status');
    assert.ok(
      report.statusLines.some((line) => line.includes('mcp/maestro-server.js')),
      'Expected public MCP entrypoints to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('hooks/canonical-source.js')),
      'Expected runtime adapter helpers to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('claude/mcp/maestro-server.js')),
      'Expected claude MCP entrypoint to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('claude/src/mcp/maestro-server.js')),
      'Expected claude local src payload to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('plugins/maestro/mcp/maestro-server.js')),
      'Expected codex MCP entrypoint to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('plugins/maestro/src/mcp/maestro-server.js')),
      'Expected codex local src payload to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('/lib/')),
      'Did not expect dry-run to mention mirrored lib outputs'
    );
    assert.deepEqual(report.nonStatusLines, []);
  });

  it('generated runtime wrappers resolve canonical src through local adapter helpers', () => {
    const wrapperFiles = [
      'hooks/session-start.js',
      'hooks/before-agent.js',
      'hooks/after-agent.js',
      'hooks/session-end.js',
      'mcp/maestro-server.js',
      'claude/scripts/session-start.js',
      'claude/scripts/before-agent.js',
      'claude/scripts/session-end.js',
      'claude/mcp/maestro-server.js',
      'plugins/maestro/mcp/maestro-server.js',
    ];

    for (const relativePath of wrapperFiles) {
      const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

      assert.ok(
        content.includes("require('./canonical-source')"),
        `Expected ${relativePath} to use the canonical source helper`
      );
      assert.ok(
        !content.includes('/lib/'),
        `Expected ${relativePath} to avoid mirrored lib imports`
      );
    }
  });
});
