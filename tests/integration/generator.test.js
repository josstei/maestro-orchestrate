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
    assert.deepEqual(report.nonStatusLines, []);
  });
});
