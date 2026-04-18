'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseBlockers } = require('../../src/mcp/handlers/blocker-parser');

describe('parseBlockers', () => {
  it('returns an empty list when the text has no ## Blockers section', () => {
    assert.deepEqual(parseBlockers('## Task Report\n\nDone.\n'), []);
  });

  it('parses a single blocker block', () => {
    const text = `## Task Report
Stuff done.

## Blockers
- BLOCKER: Which framework should I use?
  Context: Two options remain viable.
  Required to proceed: A framework choice.

## Downstream Context
...`;
    const blockers = parseBlockers(text);
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].question, 'Which framework should I use?');
    assert.equal(blockers[0].context, 'Two options remain viable.');
    assert.equal(blockers[0].required, 'A framework choice.');
  });

  it('parses multiple blockers', () => {
    const text = `## Blockers
- BLOCKER: Q1
  Context: C1
  Required to proceed: R1
- BLOCKER: Q2
  Context: C2
  Required to proceed: R2`;
    const blockers = parseBlockers(text);
    assert.equal(blockers.length, 2);
    assert.equal(blockers[1].question, 'Q2');
  });

  it('accepts # Blockers as well', () => {
    const text = `# Blockers
- BLOCKER: Q
  Context: C
  Required to proceed: R`;
    assert.equal(parseBlockers(text).length, 1);
  });

  it('ignores unstructured lines within the section', () => {
    const text = `## Blockers
Just some prose.
- BLOCKER: Real question
  Context: C
  Required to proceed: R
More prose.`;
    const blockers = parseBlockers(text);
    assert.equal(blockers.length, 1);
    assert.equal(blockers[0].question, 'Real question');
  });
});
