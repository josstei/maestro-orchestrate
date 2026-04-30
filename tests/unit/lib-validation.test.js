'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  assertNonEmptyArray,
  assertSessionId,
  assertAllowlisted,
  assertRelativePath,
  assertContainedIn,
} = require('../../src/lib/validation');

const { ValidationError } = require('../../src/lib/errors');

function assertThrowsValidation(fn, messagePattern) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ValidationError, `expected ValidationError, got ${err.constructor.name}`);
    assert.equal(err.code, 'VALIDATION_ERROR');
    if (messagePattern instanceof RegExp) {
      assert.match(err.message, messagePattern);
    } else if (typeof messagePattern === 'string') {
      assert.equal(err.message, messagePattern);
    }
    return true;
  });
}

describe('assertNonEmptyArray', () => {
  it('accepts a non-empty array', () => {
    assert.equal(assertNonEmptyArray(['a'], 'items'), undefined);
  });

  it('accepts a single-element array', () => {
    assert.equal(assertNonEmptyArray([1], 'nums'), undefined);
  });

  it('throws ValidationError for an empty array', () => {
    assertThrowsValidation(
      () => assertNonEmptyArray([], 'agents'),
      'agents must be a non-empty array'
    );
  });

  it('throws ValidationError for null', () => {
    assertThrowsValidation(
      () => assertNonEmptyArray(null, 'resources'),
      'resources must be a non-empty array'
    );
  });

  it('throws ValidationError for undefined', () => {
    assertThrowsValidation(
      () => assertNonEmptyArray(undefined, 'resources'),
      'resources must be a non-empty array'
    );
  });

  it('throws ValidationError for a string', () => {
    assertThrowsValidation(
      () => assertNonEmptyArray('not-an-array', 'items'),
      'items must be a non-empty array'
    );
  });

  it('throws ValidationError for a number', () => {
    assertThrowsValidation(
      () => assertNonEmptyArray(42, 'items'),
      'items must be a non-empty array'
    );
  });

  it('throws ValidationError for an object', () => {
    assertThrowsValidation(
      () => assertNonEmptyArray({ length: 1 }, 'items'),
      'items must be a non-empty array'
    );
  });

  it('includes label and value in error details', () => {
    try {
      assertNonEmptyArray([], 'agents');
      assert.fail('should have thrown');
    } catch (err) {
      assert.deepEqual(err.details, { value: [], label: 'agents' });
    }
  });

  it('uses the provided label in the message', () => {
    assertThrowsValidation(
      () => assertNonEmptyArray([], 'resources'),
      'resources must be a non-empty array'
    );
  });
});

describe('assertSessionId', () => {
  const VALID_IDS = [
    'session-1',
    'my_session',
    'ABC123',
    'a',
    'a-b_c-D-E',
    '0',
    'plan-2024-impl',
  ];

  for (const id of VALID_IDS) {
    it(`accepts valid ID: "${id}"`, () => {
      assert.equal(assertSessionId(id), undefined);
    });
  }

  it('throws for empty string', () => {
    assertThrowsValidation(
      () => assertSessionId(''),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for string with spaces', () => {
    assertThrowsValidation(
      () => assertSessionId('has space'),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for string with dots', () => {
    assertThrowsValidation(
      () => assertSessionId('has.dot'),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for string with slashes', () => {
    assertThrowsValidation(
      () => assertSessionId('path/traversal'),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for null', () => {
    assertThrowsValidation(
      () => assertSessionId(null),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for undefined', () => {
    assertThrowsValidation(
      () => assertSessionId(undefined),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for a number', () => {
    assertThrowsValidation(
      () => assertSessionId(42),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('throws for an object', () => {
    assertThrowsValidation(
      () => assertSessionId({}),
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+'
    );
  });

  it('includes the invalid value in error details', () => {
    try {
      assertSessionId('bad!id');
      assert.fail('should have thrown');
    } catch (err) {
      assert.deepEqual(err.details, { value: 'bad!id' });
    }
  });
});

describe('assertAllowlisted', () => {
  const ALLOWLIST_ARRAY = ['architect', 'coder', 'tester', 'debugger'];
  const ALLOWLIST_MAP = { skill_a: 'path/a', skill_b: 'path/b', skill_c: 'path/c' };

  describe('with array allowlist', () => {
    it('accepts a single valid string', () => {
      assert.equal(assertAllowlisted('coder', ALLOWLIST_ARRAY, 'agent'), undefined);
    });

    it('accepts an array of valid values', () => {
      assert.equal(
        assertAllowlisted(['architect', 'tester'], ALLOWLIST_ARRAY, 'agents'),
        undefined
      );
    });

    it('throws for a single unknown string', () => {
      assertThrowsValidation(
        () => assertAllowlisted('unknown-agent', ALLOWLIST_ARRAY, 'agent'),
        'Unknown agent: "unknown-agent". Known identifiers: architect, coder, tester, debugger'
      );
    });

    it('throws listing all invalid values when array has multiple misses', () => {
      assertThrowsValidation(
        () => assertAllowlisted(['coder', 'bogus', 'fake'], ALLOWLIST_ARRAY, 'agent'),
        'Unknown agent: "bogus", "fake". Known identifiers: architect, coder, tester, debugger'
      );
    });

    it('throws for entirely invalid array', () => {
      assertThrowsValidation(
        () => assertAllowlisted(['x', 'y'], ALLOWLIST_ARRAY, 'agent'),
        'Unknown agent: "x", "y". Known identifiers: architect, coder, tester, debugger'
      );
    });
  });

  describe('with object/map allowlist', () => {
    it('accepts a valid key', () => {
      assert.equal(assertAllowlisted('skill_a', ALLOWLIST_MAP, 'resource'), undefined);
    });

    it('accepts an array of valid keys', () => {
      assert.equal(
        assertAllowlisted(['skill_a', 'skill_c'], ALLOWLIST_MAP, 'resource'),
        undefined
      );
    });

    it('throws for an unknown key', () => {
      assertThrowsValidation(
        () => assertAllowlisted('skill_z', ALLOWLIST_MAP, 'resource'),
        'Unknown resource: "skill_z". Known identifiers: skill_a, skill_b, skill_c'
      );
    });
  });

  it('includes invalid and permitted lists in error details', () => {
    try {
      assertAllowlisted('nope', ALLOWLIST_ARRAY, 'agent');
      assert.fail('should have thrown');
    } catch (err) {
      assert.deepEqual(err.details.invalid, ['nope']);
      assert.deepEqual(err.details.permitted, ALLOWLIST_ARRAY);
      assert.equal(err.details.label, 'agent');
    }
  });
});

describe('assertRelativePath', () => {
  const VALID_PATHS = [
    'state/active-session.md',
    'plans/archive/session-1.md',
    'simple.txt',
    'a/b/c/d.js',
  ];

  for (const p of VALID_PATHS) {
    it(`accepts valid relative path: "${p}"`, () => {
      assert.equal(assertRelativePath(p), undefined);
    });
  }

  it('throws for an absolute Unix path', () => {
    assertThrowsValidation(
      () => assertRelativePath('/etc/passwd'),
      'Path must be relative'
    );
  });

  it('throws for an absolute Windows drive path', () => {
    assertThrowsValidation(
      () => assertRelativePath('C:\\Temp\\file.txt'),
      'Path must be relative'
    );
  });

  it('throws for an absolute Windows UNC path', () => {
    assertThrowsValidation(
      () => assertRelativePath('\\\\server\\share\\file.txt'),
      'Path must be relative'
    );
  });

  it('throws for an absolute Windows rooted path', () => {
    assertThrowsValidation(
      () => assertRelativePath('\\Temp\\file.txt'),
      'Path must be relative'
    );
  });

  it('throws for path traversal with leading ..', () => {
    assertThrowsValidation(
      () => assertRelativePath('../outside'),
      'Path traversal not allowed'
    );
  });

  it('throws for path traversal with embedded ..', () => {
    assertThrowsValidation(
      () => assertRelativePath('inside/../../../outside'),
      'Path traversal not allowed'
    );
  });

  it('throws for path traversal with backslash separators', () => {
    assertThrowsValidation(
      () => assertRelativePath('inside\\..\\outside'),
      'Path traversal not allowed'
    );
  });

  it('throws for null bytes', () => {
    assertThrowsValidation(
      () => assertRelativePath('file\0.txt'),
      'Path contains null bytes'
    );
  });

  it('throws for non-string input (null)', () => {
    assertThrowsValidation(
      () => assertRelativePath(null),
      'Path must be a string'
    );
  });

  it('throws for non-string input (number)', () => {
    assertThrowsValidation(
      () => assertRelativePath(42),
      'Path must be a string'
    );
  });

  it('throws for non-string input (undefined)', () => {
    assertThrowsValidation(
      () => assertRelativePath(undefined),
      'Path must be a string'
    );
  });

  it('includes the invalid path in error details', () => {
    try {
      assertRelativePath('/root/path');
      assert.fail('should have thrown');
    } catch (err) {
      assert.deepEqual(err.details, { value: '/root/path' });
    }
  });
});

describe('assertContainedIn', () => {
  const CWD = process.cwd();

  it('accepts a path that is within the base directory', () => {
    const target = path.join(CWD, 'subdir', 'file.txt');
    assert.equal(assertContainedIn(target, CWD), undefined);
  });

  it('accepts a path equal to the base directory', () => {
    assert.equal(assertContainedIn(CWD, CWD), undefined);
  });

  it('throws for a path outside the base directory', () => {
    const base = path.join(CWD, 'safe');
    const target = path.join(CWD, 'unsafe', 'file.txt');
    assertThrowsValidation(
      () => assertContainedIn(target, base),
      'Path escapes base directory'
    );
  });

  it('throws for a parent directory', () => {
    const base = path.join(CWD, 'safe', 'nested');
    const target = path.join(CWD, 'safe');
    assertThrowsValidation(
      () => assertContainedIn(target, base),
      'Path escapes base directory'
    );
  });

  it('throws for a sibling directory', () => {
    const base = path.join(CWD, 'dir-a');
    const target = path.join(CWD, 'dir-b', 'file.txt');
    assertThrowsValidation(
      () => assertContainedIn(target, base),
      'Path escapes base directory'
    );
  });

  it('throws when path prefix-matches but is not a true child', () => {
    const base = path.join(CWD, 'base');
    const target = path.join(CWD, 'base-extended', 'file.txt');
    assertThrowsValidation(
      () => assertContainedIn(target, base),
      'Path escapes base directory'
    );
  });

  it('includes path and base in error details', () => {
    const base = path.join(CWD, 'safe');
    const target = path.join(CWD, 'other');
    try {
      assertContainedIn(target, base);
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.details.path.endsWith('other'));
      assert.ok(err.details.base.endsWith('safe'));
    }
  });
});

describe('all validators throw ValidationError', () => {
  const CASES = [
    { name: 'assertNonEmptyArray', fn: () => assertNonEmptyArray(null, 'x') },
    { name: 'assertSessionId', fn: () => assertSessionId('!!!') },
    { name: 'assertAllowlisted', fn: () => assertAllowlisted('z', ['a'], 'thing') },
    { name: 'assertRelativePath', fn: () => assertRelativePath('/absolute') },
    { name: 'assertContainedIn', fn: () => assertContainedIn(path.resolve('/outside'), process.cwd()) },
  ];

  for (const { name, fn } of CASES) {
    it(`${name} throws a ValidationError instance`, () => {
      assert.throws(fn, (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err instanceof Error);
        assert.equal(err.code, 'VALIDATION_ERROR');
        assert.equal(err.name, 'ValidationError');
        assert.ok(typeof err.message === 'string');
        assert.ok(err.message.length > 0);
        return true;
      });
    });
  }
});

describe('all validators return undefined on valid input', () => {
  const CASES = [
    { name: 'assertNonEmptyArray', fn: () => assertNonEmptyArray(['ok'], 'list') },
    { name: 'assertSessionId', fn: () => assertSessionId('valid-id') },
    { name: 'assertAllowlisted', fn: () => assertAllowlisted('a', ['a', 'b'], 'item') },
    { name: 'assertRelativePath', fn: () => assertRelativePath('relative/path.txt') },
    {
      name: 'assertContainedIn',
      fn: () => assertContainedIn(path.join(process.cwd(), 'child'), process.cwd()),
    },
  ];

  for (const { name, fn } of CASES) {
    it(`${name} returns undefined`, () => {
      assert.equal(fn(), undefined);
    });
  }
});
