'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MaestroError,
  ValidationError,
  NotFoundError,
  ConfigError,
  StateError,
} = require('../../src/lib/errors');

const SUBCLASS_SPECS = [
  { Class: ValidationError, code: 'VALIDATION_ERROR', name: 'ValidationError' },
  { Class: NotFoundError, code: 'NOT_FOUND', name: 'NotFoundError' },
  { Class: ConfigError, code: 'CONFIG_ERROR', name: 'ConfigError' },
  { Class: StateError, code: 'STATE_ERROR', name: 'StateError' },
];

describe('MaestroError', () => {
  it('extends Error', () => {
    const err = new MaestroError('base');
    assert.ok(err instanceof Error);
    assert.ok(err instanceof MaestroError);
  });

  it('sets name to constructor name', () => {
    const err = new MaestroError('base');
    assert.equal(err.name, 'MaestroError');
  });

  it('assigns default code when no options provided', () => {
    const err = new MaestroError('base');
    assert.equal(err.code, 'MAESTRO_ERROR');
  });

  it('defaults details and context to null', () => {
    const err = new MaestroError('base');
    assert.equal(err.details, null);
    assert.equal(err.context, null);
  });

  it('preserves message', () => {
    const err = new MaestroError('something broke');
    assert.equal(err.message, 'something broke');
  });

  it('captures stack trace', () => {
    const err = new MaestroError('trace');
    assert.ok(typeof err.stack === 'string');
    assert.ok(err.stack.includes('MaestroError'));
    assert.ok(err.stack.includes('lib-errors.test.js'));
  });

  it('accepts custom code, details, and context', () => {
    const details = { field: 'name', constraint: 'required' };
    const context = { handler: 'create_session' };
    const err = new MaestroError('custom', {
      code: 'CUSTOM_CODE',
      details,
      context,
    });
    assert.equal(err.code, 'CUSTOM_CODE');
    assert.deepEqual(err.details, details);
    assert.deepEqual(err.context, context);
  });

  it('can be caught as Error', () => {
    let caught = false;
    try {
      throw new MaestroError('thrown');
    } catch (e) {
      if (e instanceof Error) caught = true;
    }
    assert.ok(caught);
  });
});

describe('Subclass contracts', () => {
  for (const { Class, code, name } of SUBCLASS_SPECS) {
    describe(name, () => {
      it('extends both MaestroError and Error', () => {
        const err = new Class('test');
        assert.ok(err instanceof Error);
        assert.ok(err instanceof MaestroError);
        assert.ok(err instanceof Class);
      });

      it(`has code "${code}"`, () => {
        const err = new Class('test');
        assert.equal(err.code, code);
      });

      it(`has name "${name}"`, () => {
        const err = new Class('test');
        assert.equal(err.name, name);
      });

      it('defaults details and context to null', () => {
        const err = new Class('test');
        assert.equal(err.details, null);
        assert.equal(err.context, null);
      });

      it('preserves message', () => {
        const err = new Class('specific message');
        assert.equal(err.message, 'specific message');
      });

      it('captures stack trace referencing the test file', () => {
        const err = new Class('trace');
        assert.ok(typeof err.stack === 'string');
        assert.ok(err.stack.includes('lib-errors.test.js'));
      });

      it('accepts details and context options', () => {
        const details = { reason: 'missing field' };
        const context = { tool: 'get_agent' };
        const err = new Class('opts', { details, context });
        assert.deepEqual(err.details, details);
        assert.deepEqual(err.context, context);
      });

      it(`defaults to code "${code}" and allows caller to set a more specific subtype code`, () => {
        const defaultErr = new Class('default code');
        assert.equal(defaultErr.code, code);

        const overridden = new Class('specific subtype', { code: 'MORE_SPECIFIC_SUBTYPE' });
        assert.equal(overridden.code, 'MORE_SPECIFIC_SUBTYPE');
        assert.ok(
          overridden instanceof Class,
          'instanceof relationship must survive code override'
        );
      });

      it('is distinguishable from sibling subclasses via instanceof', () => {
        const err = new Class('sibling check');
        for (const { Class: Sibling } of SUBCLASS_SPECS) {
          if (Sibling === Class) {
            assert.ok(err instanceof Sibling);
          } else {
            assert.ok(!(err instanceof Sibling));
          }
        }
      });
    });
  }
});

describe('Cross-hierarchy instanceof checks', () => {
  it('MaestroError is not instanceof any subclass', () => {
    const err = new MaestroError('base only');
    for (const { Class } of SUBCLASS_SPECS) {
      assert.ok(!(err instanceof Class));
    }
  });

  it('all subclass instances are instanceof MaestroError', () => {
    for (const { Class } of SUBCLASS_SPECS) {
      const err = new Class('check');
      assert.ok(err instanceof MaestroError);
    }
  });
});

describe('Serialization', () => {
  it('MaestroError serializes details through JSON round-trip', () => {
    const details = { fields: ['name', 'id'], counts: { a: 1 } };
    const err = new MaestroError('serial', { details });
    const serialized = JSON.parse(JSON.stringify({
      message: err.message,
      code: err.code,
      details: err.details,
      context: err.context,
    }));
    assert.equal(serialized.message, 'serial');
    assert.equal(serialized.code, 'MAESTRO_ERROR');
    assert.deepEqual(serialized.details, details);
    assert.equal(serialized.context, null);
  });

  it('subclass details survive JSON round-trip', () => {
    const details = { missing: 'agent-xyz' };
    const context = { operation: 'lookup' };
    const err = new NotFoundError('not found', { details, context });
    const serialized = JSON.parse(JSON.stringify({
      message: err.message,
      code: err.code,
      details: err.details,
      context: err.context,
    }));
    assert.equal(serialized.code, 'NOT_FOUND');
    assert.deepEqual(serialized.details, details);
    assert.deepEqual(serialized.context, context);
  });
});
