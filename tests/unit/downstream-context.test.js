'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  DOWNSTREAM_CONTEXT_SHAPE,
  normalizeDownstreamContext,
  readDownstreamContext,
} = require('../../src/mcp/contracts/downstream-context');

const CANONICAL_FIELDS = [
  'key_interfaces_introduced',
  'patterns_established',
  'integration_points',
  'assumptions',
  'warnings',
];

describe('downstream-context contract', () => {
  it('normalizes to exactly the five canonical fields, in order', () => {
    assert.deepEqual(Object.keys(normalizeDownstreamContext()), CANONICAL_FIELDS);
  });

  it('creates an empty canonical context with all fields as empty arrays', () => {
    const empty = normalizeDownstreamContext();
    for (const field of CANONICAL_FIELDS) {
      assert.deepEqual(empty[field], []);
    }
    const second = normalizeDownstreamContext();
    second.warnings.push('mutation');
    assert.deepEqual(empty.warnings, [], 'each call returns a fresh object');
  });

  describe('normalizeDownstreamContext', () => {
    it('normalizes null, undefined, and non-objects to empty canonical shape', () => {
      assert.deepEqual(normalizeDownstreamContext(null), normalizeDownstreamContext());
      assert.deepEqual(normalizeDownstreamContext(undefined), normalizeDownstreamContext());
      assert.deepEqual(normalizeDownstreamContext('not an object'), normalizeDownstreamContext());
      assert.deepEqual(normalizeDownstreamContext([]), normalizeDownstreamContext());
      assert.deepEqual(normalizeDownstreamContext(42), normalizeDownstreamContext());
    });

    it('wraps scalar strings into single-element arrays', () => {
      const result = normalizeDownstreamContext({
        integration_points: 'styles.css contains the root variables',
        patterns_established: 'Full-viewport flexbox centering',
      });
      assert.deepEqual(result.integration_points, ['styles.css contains the root variables']);
      assert.deepEqual(result.patterns_established, ['Full-viewport flexbox centering']);
      assert.deepEqual(result.assumptions, []);
    });

    it('preserves array inputs but trims and drops empty entries', () => {
      const result = normalizeDownstreamContext({
        integration_points: ['  first  ', '', 'second'],
        warnings: ['   '],
      });
      assert.deepEqual(result.integration_points, ['first', 'second']);
      assert.deepEqual(result.warnings, []);
    });

    it('treats "none", "n/a", and empty strings as absent', () => {
      const result = normalizeDownstreamContext({
        key_interfaces_introduced: 'none',
        patterns_established: 'N/A',
        integration_points: '  ',
        assumptions: 'Not Applicable',
        warnings: ['none', 'real warning', 'n/a'],
      });
      assert.deepEqual(result.key_interfaces_introduced, []);
      assert.deepEqual(result.patterns_established, []);
      assert.deepEqual(result.integration_points, []);
      assert.deepEqual(result.assumptions, []);
      assert.deepEqual(result.warnings, ['real warning']);
    });

    it('drops unknown keys silently', () => {
      const result = normalizeDownstreamContext({
        integration_points: 'valid',
        summary: 'will be dropped',
        IntegrationPoints: 'PascalCase dropped',
      });
      assert.deepEqual(Object.keys(result).sort(), [...CANONICAL_FIELDS].sort());
      assert.deepEqual(result.integration_points, ['valid']);
    });

    it('is idempotent for canonical input', () => {
      const canonical = {
        key_interfaces_introduced: ['foo()'],
        patterns_established: [],
        integration_points: ['src/app.js'],
        assumptions: [],
        warnings: [],
      };
      const once = normalizeDownstreamContext(canonical);
      const twice = normalizeDownstreamContext(once);
      assert.deepEqual(once, twice);
    });

    it('ignores non-string entries in arrays', () => {
      const result = normalizeDownstreamContext({
        warnings: ['real', 42, null, { nested: 'object' }, 'another'],
      });
      assert.deepEqual(result.warnings, ['real', 'another']);
    });
  });

  describe('readDownstreamContext', () => {
    it('is unpopulated for null, undefined, and empty inputs', () => {
      for (const input of [null, undefined, {}, normalizeDownstreamContext()]) {
        assert.deepEqual(readDownstreamContext(input), {
          context: normalizeDownstreamContext(),
          populated: false,
        });
      }
    });

    it('is unpopulated when all fields are "none" or empty', () => {
      assert.equal(
        readDownstreamContext({
          key_interfaces_introduced: 'none',
          patterns_established: [],
          integration_points: '',
          assumptions: 'N/A',
          warnings: ['none', '  '],
        }).populated,
        false
      );
    });

    it('is populated when at least one string field has content, and returns the normalized context', () => {
      const { context, populated } = readDownstreamContext({
        integration_points: 'styles.css contains the root variables',
      });
      assert.equal(populated, true);
      assert.deepEqual(context, {
        ...normalizeDownstreamContext(),
        integration_points: ['styles.css contains the root variables'],
      });
    });

    it('is populated when at least one array field has content', () => {
      assert.equal(
        readDownstreamContext({
          warnings: ['missing fallback'],
        }).populated,
        true
      );
    });
  });

  it('DOWNSTREAM_CONTEXT_SHAPE mentions every canonical field', () => {
    for (const field of CANONICAL_FIELDS) {
      assert.ok(
        DOWNSTREAM_CONTEXT_SHAPE.includes(field),
        `DOWNSTREAM_CONTEXT_SHAPE must mention canonical field "${field}"`
      );
    }
    assert.match(DOWNSTREAM_CONTEXT_SHAPE, /non-empty string/);
    assert.match(DOWNSTREAM_CONTEXT_SHAPE, /array of strings/);
  });
});
