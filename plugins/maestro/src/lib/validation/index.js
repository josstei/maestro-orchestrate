'use strict';

const { ValidationError } = require('../errors');

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * @param {*} id
 * @returns {boolean}
 */
function isValidSessionId(id) {
  return typeof id === 'string' && SESSION_ID_PATTERN.test(id);
}

/**
 * @param {*} id
 * @throws {ValidationError}
 */
function assertSessionId(id) {
  if (!isValidSessionId(id)) {
    throw new ValidationError(
      'Invalid session_id: must match pattern [a-zA-Z0-9_-]+',
      { details: { value: id } }
    );
  }
}

module.exports = {
  isValidSessionId,
  assertSessionId,
};
