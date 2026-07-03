'use strict';

const SCHEMA = Object.freeze({
  SESSION_ID: Object.freeze({ type: 'string' }),
  PHASE_ID: Object.freeze({ type: ['integer', 'string'] }),
  FILE_ARRAY: Object.freeze({ type: 'array' }),
  DOWNSTREAM_CONTEXT: Object.freeze({ type: 'object' }),
  TASK_COMPLEXITY_ENUM: Object.freeze(['simple', 'medium', 'complex']),
  BASENAME_FILENAME_DESCRIPTION: "Basename-only filename (no separators, no '..')",
  ISO_DATE: Object.freeze({
    type: 'string',
    description: 'ISO-8601 timestamp (e.g. 2026-07-02T00:00:00.000Z)',
  }),
  ARCHIVE_OUTCOME_ENUM: Object.freeze(['completed', 'failed']),
});

module.exports = { SCHEMA };
