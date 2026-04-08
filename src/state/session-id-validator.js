'use strict';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateSessionId(id) {
  if (id == null || typeof id !== 'string') return false;
  return SESSION_ID_PATTERN.test(id);
}

module.exports = { validateSessionId };
