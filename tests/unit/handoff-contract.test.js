'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  HANDOFF_CONTRACTS,
  describeHandoffContract,
  validateHandoff,
} = require('../../src/mcp/contracts/handoff-contract');

const { PHASE_KINDS } = require('../../src/mcp/contracts/plan-schema');

describe('handoff-contract module shape', () => {
  it('exports HANDOFF_CONTRACTS as a frozen object containing each of the four kinds', () => {
    assert.ok(Object.isFrozen(HANDOFF_CONTRACTS), 'HANDOFF_CONTRACTS itself must be frozen');
    for (const kind of PHASE_KINDS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(HANDOFF_CONTRACTS, kind),
        `HANDOFF_CONTRACTS missing kind: ${kind}`
      );
      assert.ok(
        Object.isFrozen(HANDOFF_CONTRACTS[kind]),
        `HANDOFF_CONTRACTS.${kind} must be frozen`
      );
      assert.ok(
        Array.isArray(HANDOFF_CONTRACTS[kind].required_fields),
        `HANDOFF_CONTRACTS.${kind}.required_fields must be an array`
      );
    }
  });

  it('exposes implementation contract with no required fields', () => {
    assert.deepEqual(HANDOFF_CONTRACTS.implementation.required_fields, []);
  });

  it('exposes review contract requiring findings', () => {
    assert.deepEqual(HANDOFF_CONTRACTS.review.required_fields, ['findings']);
  });

  it('exposes revision contract requiring addressed_finding_ids', () => {
    assert.deepEqual(HANDOFF_CONTRACTS.revision.required_fields, ['addressed_finding_ids']);
  });

  it('exposes verification contract requiring final_artifacts', () => {
    assert.deepEqual(HANDOFF_CONTRACTS.verification.required_fields, ['final_artifacts']);
  });
});

describe('describeHandoffContract', () => {
  it('returns the canonical frozen contract object (identity, not copy) for a known kind', () => {
    assert.equal(describeHandoffContract('review'), HANDOFF_CONTRACTS.review);
    assert.equal(describeHandoffContract('implementation'), HANDOFF_CONTRACTS.implementation);
    assert.equal(describeHandoffContract('revision'), HANDOFF_CONTRACTS.revision);
    assert.equal(describeHandoffContract('verification'), HANDOFF_CONTRACTS.verification);
  });

  it('throws Error when kind is not one of PHASE_KINDS', () => {
    assert.throws(() => describeHandoffContract('unknown'), Error);
    assert.throws(() => describeHandoffContract(''), Error);
    assert.throws(() => describeHandoffContract(null), Error);
    assert.throws(() => describeHandoffContract(undefined), Error);
  });
});

describe('validateHandoff strict mode (default) — kind-specific required fields', () => {
  it('accepts review handoff with non-empty findings and no files', () => {
    const result = validateHandoff('review', {
      findings: [{ id: 'F1', severity: 'high' }],
    });
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('rejects review handoff with empty findings array', () => {
    const result = validateHandoff('review', { findings: [] });
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'findings');
    assert.match(result.violations[0].message, /review/);
    assert.match(result.violations[0].message, /findings/);
  });

  it('rejects review handoff with no findings field at all', () => {
    const result = validateHandoff('review', {});
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'findings');
  });

  it('rejects revision handoff missing addressed_finding_ids', () => {
    const result = validateHandoff('revision', {});
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'addressed_finding_ids');
  });

  it('rejects verification handoff missing final_artifacts', () => {
    const result = validateHandoff('verification', {});
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'final_artifacts');
  });

  it('accepts implementation handoff with no kind-specific fields (empty required_fields)', () => {
    const result = validateHandoff('implementation', {});
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('accepts review handoff with single finding object', () => {
    const result = validateHandoff('review', { findings: [{ id: 'F1' }] });
    assert.deepEqual(result, { valid: true, violations: [] });
  });
});

describe('validateHandoff strict: false — kind-specific check skipped', () => {
  it('skips kind-specific check for review with no findings when strict is false', () => {
    const result = validateHandoff('review', {}, { strict: false });
    assert.equal(result.valid, true);
    assert.equal(
      result.violations.find((v) => v.code === 'HANDOFF_FIELD_MISSING'),
      undefined,
      'no HANDOFF_FIELD_MISSING expected when strict: false'
    );
  });

  it('skips kind-specific check for verification with no final_artifacts when strict is false', () => {
    const result = validateHandoff('verification', {}, { strict: false });
    assert.equal(result.valid, true);
    assert.equal(
      result.violations.find((v) => v.code === 'HANDOFF_FIELD_MISSING'),
      undefined
    );
  });

  it('skips kind-specific check for revision with no addressed_finding_ids when strict is false', () => {
    const result = validateHandoff('revision', {}, { strict: false });
    assert.equal(result.valid, true);
    assert.equal(
      result.violations.find((v) => v.code === 'HANDOFF_FIELD_MISSING'),
      undefined
    );
  });
});

describe('validateHandoff downstream_context check (always-on regardless of strict)', () => {
  it('flags HANDOFF_INCOMPLETE for implementation with files_created and empty downstream_context', () => {
    const result = validateHandoff('implementation', {
      files_created: ['x.js'],
      downstream_context: {},
    });
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_INCOMPLETE');
    assert.equal(result.violations[0].field, 'downstream_context');
    assert.match(result.violations[0].message, /downstream_context/);
  });

  it('flags HANDOFF_INCOMPLETE for any kind with files_modified and empty context', () => {
    const result = validateHandoff('implementation', {
      files_modified: ['y.js'],
      downstream_context: {},
    });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_INCOMPLETE');
  });

  it('flags HANDOFF_INCOMPLETE for any kind with files_deleted and empty context', () => {
    const result = validateHandoff('implementation', {
      files_deleted: ['z.js'],
      downstream_context: {},
    });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_INCOMPLETE');
  });

  it('accepts handoff with files_created and populated downstream_context', () => {
    const result = validateHandoff('implementation', {
      files_created: ['x.js'],
      downstream_context: { integration_points: ['x.js'] },
    });
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('still produces HANDOFF_INCOMPLETE when strict is false but files exist with empty context', () => {
    const result = validateHandoff(
      'implementation',
      {
        files_created: ['x.js'],
        downstream_context: {},
      },
      { strict: false }
    );
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_INCOMPLETE');
    assert.equal(result.violations[0].field, 'downstream_context');
  });

  it('does NOT flag HANDOFF_INCOMPLETE when no files are present, even with empty context', () => {
    const result = validateHandoff('implementation', {
      files_created: [],
      files_modified: [],
      files_deleted: [],
      downstream_context: {},
    });
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('handles missing files_* fields by treating them as empty', () => {
    const result = validateHandoff('implementation', {
      downstream_context: {},
    });
    assert.deepEqual(result, { valid: true, violations: [] });
  });
});

describe('validateHandoff combined kind-specific + downstream checks', () => {
  it('accepts review handoff with files, populated context, and findings', () => {
    const result = validateHandoff('review', {
      findings: [{ id: 'F1' }],
      files_created: ['notes.md'],
      downstream_context: { warnings: ['legacy code touched'] },
    });
    assert.deepEqual(result, { valid: true, violations: [] });
  });

  it('produces only HANDOFF_INCOMPLETE for review with files, empty context, and findings', () => {
    const result = validateHandoff('review', {
      findings: [{ id: 'F1' }],
      files_created: ['notes.md'],
      downstream_context: {},
    });
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_INCOMPLETE');
  });

  it('produces both violations in declared order: HANDOFF_FIELD_MISSING before HANDOFF_INCOMPLETE', () => {
    const result = validateHandoff('review', {
      files_created: ['notes.md'],
      downstream_context: {},
    });
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 2);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'findings');
    assert.equal(result.violations[1].code, 'HANDOFF_INCOMPLETE');
    assert.equal(result.violations[1].field, 'downstream_context');
  });
});

describe('validateHandoff non-empty checks for required fields', () => {
  it('treats empty findings array as missing under strict', () => {
    const result = validateHandoff('review', { findings: [] });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'findings');
  });

  it('treats whitespace-only string for required field as missing under strict', () => {
    const result = validateHandoff('review', { findings: '   ' });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'findings');
  });

  it('treats null required field as missing under strict', () => {
    const result = validateHandoff('verification', { final_artifacts: null });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'final_artifacts');
  });

  it('treats undefined required field as missing under strict', () => {
    const result = validateHandoff('verification', { final_artifacts: undefined });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'final_artifacts');
  });

  it('accepts non-empty string for required field', () => {
    const result = validateHandoff('verification', { final_artifacts: 'release.tar.gz' });
    assert.deepEqual(result, { valid: true, violations: [] });
  });
});

describe('validateHandoff strict option coercion', () => {
  it('treats strict omitted as strict: true (default)', () => {
    const result = validateHandoff('review', {});
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });

  it('treats opts: undefined as strict: true (default)', () => {
    const result = validateHandoff('review', {}, undefined);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });

  it('treats opts: {} as strict: true (default)', () => {
    const result = validateHandoff('review', {}, {});
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });

  it('treats only strict === false as non-strict', () => {
    const result = validateHandoff('review', {}, { strict: false });
    assert.equal(result.valid, true);
  });
});

describe('validateHandoff non-mutation', () => {
  it('does not mutate the payload', () => {
    const payload = {
      files_created: ['x.js'],
      downstream_context: { integration_points: ['x.js'] },
    };
    const before = JSON.parse(JSON.stringify(payload));
    validateHandoff('implementation', payload);
    assert.deepEqual(payload, before);
  });
});

describe('validateHandoff unknown kind', () => {
  it('throws when kind is not in PHASE_KINDS (delegates to describeHandoffContract)', () => {
    assert.throws(() => validateHandoff('not-a-kind', {}), Error);
  });
});

describe('validateHandoff null-safety', () => {
  it('does not throw for null payload (implementation, no required fields)', () => {
    assert.doesNotThrow(() => validateHandoff('implementation', null));
    const result = validateHandoff('implementation', null);
    assert.equal(result.valid, true);
    assert.deepEqual(result.violations, []);
  });

  it('does not throw for null payload (review with required fields, strict)', () => {
    assert.doesNotThrow(() => validateHandoff('review', null));
    const result = validateHandoff('review', null);
    assert.equal(result.valid, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
    assert.equal(result.violations[0].field, 'findings');
  });

  it('does not throw for undefined payload', () => {
    assert.doesNotThrow(() => validateHandoff('verification', undefined));
    const result = validateHandoff('verification', undefined);
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });

  it('does not throw and treats non-object payload as missing all fields', () => {
    assert.doesNotThrow(() => validateHandoff('review', 'not-an-object'));
    const result = validateHandoff('review', 'not-an-object');
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });
});

describe('validateHandoff file-field type guards', () => {
  it('treats non-array files_created as empty (string input)', () => {
    const result = validateHandoff('implementation', { files_created: 'x.js' });
    assert.equal(result.valid, true, 'string files_created should not trigger HANDOFF_INCOMPLETE');
  });

  it('treats non-array files_modified as empty (number input)', () => {
    const result = validateHandoff('implementation', { files_modified: 3 });
    assert.equal(result.valid, true);
  });

  it('treats non-array files_deleted as empty (object input)', () => {
    const result = validateHandoff('implementation', { files_deleted: { count: 2 } });
    assert.equal(result.valid, true);
  });
});

describe('validateHandoff required-field type strictness', () => {
  it('rejects empty object as findings', () => {
    const result = validateHandoff('review', { findings: {} });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });

  it('accepts non-empty object as final_artifacts', () => {
    const result = validateHandoff('verification', { final_artifacts: { path: '/foo' } });
    assert.equal(result.valid, true);
  });

  it('rejects number 0 as findings (numbers are not valid handoff values)', () => {
    const result = validateHandoff('review', { findings: 0 });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });

  it('rejects boolean true as final_artifacts', () => {
    const result = validateHandoff('verification', { final_artifacts: true });
    assert.equal(result.valid, false);
    assert.equal(result.violations[0].code, 'HANDOFF_FIELD_MISSING');
  });
});
