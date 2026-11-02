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
const ROOT_VARS = 'styles.css contains the root variables';
const CENTERING = 'Full-viewport flexbox centering';
/** A canonical context with every field empty except those in `fields`. */
const context = (fields = {}) => ({ ...Object.fromEntries(EXPECTED_FIELDS.map((field) => [field, []])), ...fields });

describe('downstream-context contract', () => {
  it('normalizes to exactly the five canonical fields in order, as fresh empty arrays', () => {
    const empty = normalizeDownstreamContext(null);
    assert.deepEqual(Object.keys(empty), EXPECTED_FIELDS);
    for (const field of EXPECTED_FIELDS) assert.deepEqual(empty[field], []);
    normalizeDownstreamContext(null).warnings.push('mutation');
    assert.deepEqual(empty.warnings, [], 'normalization returns fresh arrays');
  });

  describe('normalizeDownstreamContext', () => {
    for (const [name, input, expected] of [
      ...[null, undefined, 'not an object', [], 42].map((input) =>
        [`normalizes ${JSON.stringify(input) ?? 'undefined'} to the empty canonical shape`, input, context()]),
      ['wraps scalar strings into single-element arrays',
        { integration_points: ROOT_VARS, patterns_established: CENTERING },
        context({ integration_points: [ROOT_VARS], patterns_established: [CENTERING] })],
      ['preserves array inputs but trims and drops empty entries',
        { integration_points: ['  first  ', '', 'second'], warnings: ['   '] },
        context({ integration_points: ['first', 'second'] })],
      ['treats "none", "n/a", and empty strings as absent', {
        key_interfaces_introduced: 'none', patterns_established: 'N/A', integration_points: '  ',
        assumptions: 'Not Applicable', warnings: ['none', 'real warning', 'n/a'],
      }, context({ warnings: ['real warning'] })],
      ['drops unknown keys silently',
        { integration_points: 'valid', summary: 'will be dropped', IntegrationPoints: 'PascalCase dropped' },
        context({ integration_points: ['valid'] })],
      ['ignores non-string entries in arrays',
        { warnings: ['real', 42, null, { nested: 'object' }, 'another'] }, context({ warnings: ['real', 'another'] })],
    ]) {
      it(name, () => {
        assert.deepEqual(normalizeDownstreamContext(input), expected);
      });
    }

    it('is idempotent for canonical input', () => {
      const canonical = context({ key_interfaces_introduced: ['foo()'], integration_points: ['src/app.js'] });
      const once = normalizeDownstreamContext(canonical);
      assert.deepEqual(normalizeDownstreamContext(once), once);
    });
  });

  it('isDownstreamContextPopulated is true only when a normalized field has content', () => {
    for (const [input, expected] of [
      [null, false],
      [undefined, false],
      [{}, false],
      [{
        key_interfaces_introduced: 'none', patterns_established: [], integration_points: '', assumptions: 'N/A',
        warnings: ['none', '  '],
      }, false],
      [{ integration_points: ROOT_VARS }, true],
      [{ warnings: ['missing fallback'] }, true],
    ]) {
      assert.equal(isDownstreamContextPopulated(normalizeDownstreamContext(input)), expected, JSON.stringify(input));
    }
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
