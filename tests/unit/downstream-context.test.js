'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeDownstreamContext,
  isDownstreamContextPopulated,
  describeShape,
} = require('../../src/mcp/contracts/downstream-context');

const EXPECTED_FIELDS = [
  'key_interfaces_introduced',
  'patterns_established',
  'integration_points',
  'assumptions',
  'warnings',
];

describe('downstream-context contract', () => {
  it('normalizes to exactly the five canonical fields in order', () => {
    assert.deepEqual(Object.keys(normalizeDownstreamContext(null)), EXPECTED_FIELDS);
  });

  it('creates an empty canonical context with all fields as empty arrays', () => {
    const empty = normalizeDownstreamContext(null);
    for (const field of EXPECTED_FIELDS) {
      assert.deepEqual(empty[field], []);
    }
    const second = normalizeDownstreamContext(null);
    second.warnings.push('mutation');
    assert.deepEqual(empty.warnings, [], 'normalization returns fresh arrays');
  });

  describe('normalizeDownstreamContext', () => {
    it('normalizes null, undefined, and non-objects to empty canonical shape', () => {
      const empty = Object.fromEntries(EXPECTED_FIELDS.map((field) => [field, []]));
      for (const input of [null, undefined, 'not an object', [], 42]) {
        assert.deepEqual(normalizeDownstreamContext(input), empty);
      }
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
      assert.deepEqual(Object.keys(result).sort(), [...EXPECTED_FIELDS].sort());
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

  describe('isDownstreamContextPopulated', () => {
    it('returns false after normalizing null, undefined, and empty inputs', () => {
      for (const input of [null, undefined, {}]) {
        assert.equal(isDownstreamContextPopulated(normalizeDownstreamContext(input)), false);
      }
    });

    it('returns false when all fields are "none" or empty', () => {
      assert.equal(
        isDownstreamContextPopulated(normalizeDownstreamContext({
          key_interfaces_introduced: 'none',
          patterns_established: [],
          integration_points: '',
          assumptions: 'N/A',
          warnings: ['none', '  '],
        })),
        false
      );
    });

    it('returns true when at least one string field has content', () => {
      assert.equal(
        isDownstreamContextPopulated(normalizeDownstreamContext({
          integration_points: 'styles.css contains the root variables',
        })),
        true
      );
    });

    it('returns true when at least one array field has content', () => {
      assert.equal(
        isDownstreamContextPopulated(normalizeDownstreamContext({
          warnings: ['missing fallback'],
        })),
        true
      );
    });
  });

  it('describeShape() mentions every canonical field', () => {
    const description = describeShape();
    for (const field of EXPECTED_FIELDS) {
      assert.ok(
        description.includes(field),
        `describeShape() must mention canonical field "${field}"`
      );
    }
    assert.match(description, /non-empty string/);
    assert.match(description, /array of strings/);
  });
});
