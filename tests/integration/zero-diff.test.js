const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DRY_RUN_MARKER, parseDryRunReport, runGenerator } = require('./helpers');

describe('zero-diff validation', () => {
  it('generator output matches committed files exactly', () => {
    const report = parseDryRunReport(runGenerator(['--dry-run']));

    assert.equal(report.marker, DRY_RUN_MARKER);
    assert.ok(report.statusLines.length > 0, 'Expected generator to inspect manifest outputs');
    assert.deepEqual(
      report.driftLines,
      [],
      `Generator output drift detected:\n${report.driftLines.join('\n')}`
    );
  });
});
