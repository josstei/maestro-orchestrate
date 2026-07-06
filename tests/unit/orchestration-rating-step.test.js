import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);

test('orchestration-steps.md solicits a Completion-phase satisfaction rating', () => {
  const body = fs.readFileSync(
    path.join(moduleDirname, '../../src/references/orchestration-steps.md'),
    'utf8'
  );
  assert.ok(body.includes('rate('), 'missing rate capture step');

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

  const ratingIdx = body.indexOf('rate(', completionIdx);
  assert.ok(
    ratingIdx > codeReviewIdx && ratingIdx < archiveIdx,
    'rating step is not inside the Completion phase after code review and before archive'
  );
});
