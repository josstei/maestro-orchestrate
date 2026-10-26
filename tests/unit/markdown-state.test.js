'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { serialize, parse } = require('../../src/core/markdown-state');

const NESTED = {
  session: {
    id: 'sess-001',
    phases: [{ name: 'design', status: 'complete' }, { name: 'implement', status: 'pending' }],
    metadata: { created: '2026-04-12', tags: ['refactor', 'core'] },
  },
};
const DASHED_BODY = 'Line one\n---\nLine three after dashes';

describe('markdown-state', () => {
  it('serialize writes pretty JSON between --- delimiters, then the body or nothing', () => {
    const serialized = serialize({ phase: 'design' }, '## Notes\nSome content');
    assert.equal(serialized, '---\n{\n  "phase": "design"\n}\n---\n## Notes\nSome content');
    for (const body of [null, undefined]) assert.ok(serialize({ key: 'value' }, body).endsWith('---\n'), String(body));
  });

  for (const [name, content, data, body] of [
    ['parse extracts JSON data and the body after the closing ---',
      '---\n{"status": "active"}\n---\nThis is the body', { status: 'active' }, 'This is the body'],
    ['parse returns an empty body when no body content exists', '---\n{"id": 1}\n---\n', { id: 1 }, ''],
    ['parse handles complex nested JSON data', `---\n${JSON.stringify(NESTED, null, 2)}\n---\nBody`, NESTED, 'Body'],
    ['parse preserves --- on non-delimiter lines within body',
      `---\n{"key": "value"}\n---\n${DASHED_BODY}`, { key: 'value' }, DASHED_BODY],
  ]) {
    it(name, () => {
      assert.deepEqual(parse(content), { data, body });
    });
  }

  it('parse throws with correct message when no frontmatter found', () => {
    assert.throws(
      () => parse('no delimiters here'),
      { message: 'No YAML frontmatter found in session state' }
    );
  });

  it('parse(serialize(data, body)) returns the original data and body, including an empty body', () => {
    for (const [data, body] of [
      [{ phase: 'execution', step: 3 }, '## Progress\n- Step 1 done\n- Step 2 done'],
      [{ empty: true }, ''],
    ]) {
      assert.deepEqual(parse(serialize(data, body)), { data, body });
    }
  });
});
