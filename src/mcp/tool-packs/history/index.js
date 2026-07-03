'use strict';

const { defineToolPack } = require('../contracts');
const { SCHEMA } = require('../schema-fragments');
const {
  handleForkSession,
  handleListLineage,
} = require('../../handlers/session-lineage');
const {
  handleListCheckpoints,
  handleRestoreCheckpoint,
} = require('../../handlers/checkpoints');

function createToolPack() {
  return defineToolPack({
    name: 'history',
    tools: [
      {
        name: 'fork_session',
        description:
          'Fork an archived Maestro session into a new active session, recording parent_session_id and an optional branch label.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            source_session_id: SCHEMA.SESSION_ID,
            new_session_id: SCHEMA.SESSION_ID,
            branch: { type: ['string', 'null'] },
          },
          required: ['source_session_id', 'new_session_id'],
        },
      },
      {
        name: 'list_lineage',
        description:
          'Return a session parent and direct children by scanning the active session and archived sessions.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: SCHEMA.SESSION_ID,
          },
          required: ['session_id'],
        },
      },
      {
        name: 'list_checkpoints',
        description:
          'List append-only per-phase checkpoints captured for an active Maestro session.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: SCHEMA.SESSION_ID,
          },
          required: ['session_id'],
        },
      },
      {
        name: 'restore_checkpoint',
        description:
          'Restore a captured phase checkpoint by transforming future phases back to pending state.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: SCHEMA.SESSION_ID,
            phase_id: SCHEMA.PHASE_ID,
          },
          required: ['session_id', 'phase_id'],
        },
      },
    ],
    handlers: {
      fork_session: handleForkSession,
      list_lineage: handleListLineage,
      list_checkpoints: handleListCheckpoints,
      restore_checkpoint: handleRestoreCheckpoint,
    },
  });
}

module.exports = {
  createToolPack,
};
