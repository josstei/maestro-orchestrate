'use strict';

const { ValidationError } = require('../errors');

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * @param {*} id
 * @throws {ValidationError}
 */
function assertSessionId(id) {
  if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
    throw new ValidationError(
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+',
      { details: { value: id } }
    );
  }
}

module.exports = {
  assertSessionId,
};
