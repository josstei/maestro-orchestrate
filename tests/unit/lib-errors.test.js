'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const errors = require('../../src/lib/errors');

// [exported class name, default code]; the base class meets the same contract as every subclass.
const ERROR_SPECS = [
  ['MaestroError', 'MAESTRO_ERROR'],
  ['ValidationError', 'VALIDATION_ERROR'],
  ['NotFoundError', 'NOT_FOUND'],
  ['StateError', 'STATE_ERROR'],
];

for (const [name, code] of ERROR_SPECS) {
  const Class = errors[name];
  describe(name, () => {
    it('extends MaestroError and Error and is distinguishable from sibling classes via instanceof', () => {
      const err = new Class('sibling check');
      assert.ok(err instanceof Error);
      for (const [other] of ERROR_SPECS) {
        assert.equal(err instanceof errors[other], other === name || other === 'MaestroError', other);
      }
    });

    it(`has name "${name}", preserves message, defaults code and details and captures a stack trace`, () => {
      const err = new Class('specific message');
      assert.equal(err.name, name);
      assert.equal(err.message, 'specific message');
      assert.equal(err.code, code);
      assert.equal(err.details, null);
      assert.ok(err.stack.includes(name));
      assert.ok(err.stack.includes('lib-errors.test.js'));
    });

    it('keeps details with the default code or a more specific one', () => {
      const details = { field: 'name', constraint: 'required' };
      const cases = [[{ details }, code], [{ code: 'MORE_SPECIFIC_SUBTYPE', details }, 'MORE_SPECIFIC_SUBTYPE']];
      for (const [opts, expected] of cases) {
        const err = new Class('opts', opts);
        assert.equal(err.code, expected);
        assert.deepEqual(err.details, details);
        assert.ok(err instanceof Class, 'instanceof relationship must survive code override');
      }
    });
  });
}
