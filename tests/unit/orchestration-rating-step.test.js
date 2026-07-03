'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('orchestration-steps.md solicits a Completion-phase satisfaction rating', () => {
  const body = fs.readFileSync(
    path.join(__dirname, '../../src/references/orchestration-steps.md'),
    'utf8'
  );
  assert.ok(body.includes('rate_session'), 'missing rate_session capture step');
  assert.ok(body.includes('rate_phase'), 'missing rate_phase capture step');

  const completionIdx = body.indexOf('COMPLETION (Phase 4)');
  assert.ok(completionIdx >= 0, 'Completion phase section not found');

  const codeReviewIdx = body.indexOf(
    'delegate to the code reviewer agent',
    completionIdx
  );
  assert.ok(codeReviewIdx > completionIdx, 'code-review delegation step missing');

  const archiveIdx = body.indexOf('call archive_session', completionIdx);
  assert.ok(archiveIdx > codeReviewIdx, 'archive step missing or misordered');

  const summaryIdx = body.indexOf('Present final summary', completionIdx);
  assert.ok(summaryIdx > archiveIdx, 'final-summary step missing or misordered');

  const ratingIdx = body.indexOf('rate_session', completionIdx);
  assert.ok(
    ratingIdx > codeReviewIdx && ratingIdx < archiveIdx,
    'rating step is not inside the Completion phase after code review and before archive'
  );
});
