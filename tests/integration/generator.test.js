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
      report.statusLines.some((line) => line.includes('agents/architect.md')),
      'Expected agent stubs in dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('claude/agents/architect.md')),
      'Expected claude agent stubs in dry-run report'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('canonical-source.js')),
      'Did not expect dry-run to include canonical-source copies'
    );
    assert.ok(
      report.statusLines.every((line) => !line.includes('/lib/')),
      'Did not expect dry-run to mention mirrored lib outputs'
    );
    assert.deepEqual(report.nonStatusLines, []);
  });

  it('thin MCP entrypoints resolve canonical src without canonical-source helpers', () => {
    const entrypoints = [
      'mcp/maestro-server.js',
      'claude/mcp/maestro-server.js',
      'plugins/maestro/mcp/maestro-server.js',
    ];

    for (const relativePath of entrypoints) {
      const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

      assert.ok(
        !content.includes("require('./canonical-source')"),
        `Expected ${relativePath} to NOT use canonical-source helper`
      );
      assert.ok(
        content.includes('MAESTRO_RUNTIME'),
        `Expected ${relativePath} to set MAESTRO_RUNTIME`
      );
    }
  });
});
