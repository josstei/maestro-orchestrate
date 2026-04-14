'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { serialize, parse } = require('../../src/core/markdown-state');

describe('markdown-state', () => {
  describe('serialize', () => {
    it('produces correct format with --- delimiters', () => {
      const data = { phase: 'design' };
      const body = '## Notes\nSome content';
      const result = serialize(data, body);

      assert.equal(result, '---\n{\n  "phase": "design"\n}\n---\n## Notes\nSome content');
    });

    it('produces empty body when body is null', () => {
      const result = serialize({ key: 'value' }, null);

      assert.ok(result.endsWith('---\n'));
    });

    it('produces empty body when body is undefined', () => {
      const result = serialize({ key: 'value' });

      assert.ok(result.endsWith('---\n'));
    });
  });

  describe('parse', () => {
    it('extracts JSON data correctly', () => {
      const content = '---\n{"status": "active"}\n---\nbody text';
      const { data } = parse(content);

      assert.deepEqual(data, { status: 'active' });
    });

    it('extracts body content after closing ---', () => {
      const content = '---\n{"id": 1}\n---\nThis is the body';
      const { body } = parse(content);

      assert.equal(body, 'This is the body');
    });

    it('returns empty string for body when no body content exists', () => {
      const content = '---\n{"id": 1}\n---\n';
      const { body } = parse(content);

      assert.equal(body, '');
    });

    it('throws with correct message when no frontmatter found', () => {
      assert.throws(
        () => parse('no delimiters here'),
        { message: 'No YAML frontmatter found in session state' }
      );
    });

    it('handles complex nested JSON data', () => {
      const nested = {
        session: {
          id: 'sess-001',
          phases: [
            { name: 'design', status: 'complete' },
            { name: 'implement', status: 'pending' },
          ],
          metadata: {
            created: '2026-04-12',
            tags: ['refactor', 'core'],
          },
        },
      };
      const content = `---\n${JSON.stringify(nested, null, 2)}\n---\nBody`;
      const { data } = parse(content);

      assert.deepEqual(data, nested);
    });

    it('preserves --- on non-delimiter lines within body', () => {
      const body = 'Line one\n---\nLine three after dashes';
      const content = `---\n{"key": "value"}\n---\n${body}`;
      const { data, body: parsedBody } = parse(content);

      assert.deepEqual(data, { key: 'value' });
      assert.equal(parsedBody, body);
    });
  });

  describe('round-trip', () => {
    it('parse(serialize(data, body)) returns original data and body', () => {
      const originalData = { phase: 'execution', step: 3 };
      const originalBody = '## Progress\n- Step 1 done\n- Step 2 done';

      const serialized = serialize(originalData, originalBody);
      const { data, body } = parse(serialized);

      assert.deepEqual(data, originalData);
      assert.equal(body, originalBody);
    });

    it('round-trips with empty body', () => {
      const originalData = { empty: true };

      const serialized = serialize(originalData, '');
      const { data, body } = parse(serialized);

      assert.deepEqual(data, originalData);
      assert.equal(body, '');
    });
  });
});
