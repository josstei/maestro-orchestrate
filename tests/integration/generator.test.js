const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  DRY_RUN_MARKER,
  getGitStatus,
  parseDryRunReport,
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
      report.statusLines.some((line) => line.includes('lib/mcp/core/create-server.js')),
      'Expected generated lib outputs to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('plugins/maestro/lib/mcp/tool-packs/index.js')),
      'Expected codex lib outputs to be included in the dry-run report'
    );
    assert.ok(
      report.statusLines.some((line) => line.includes('plugins/maestro/src/references/orchestration-steps.md')),
      'Expected codex canonical MCP content outputs to be included in the dry-run report'
    );
    assert.deepEqual(report.nonStatusLines, []);
  });
});
