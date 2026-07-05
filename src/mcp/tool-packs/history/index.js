import { defineToolPack } from '../contracts.js';
import { SCHEMA } from '../schema-fragments.js';
import { handleForkSession, handleListLineage } from '../../handlers/session-lineage.js';
import { handleListCheckpoints, handleRestoreCheckpoint } from '../../handlers/checkpoints.js';
import { handleInstantiateSessionBlueprint, handleListSessionBlueprints } from '../../handlers/session-blueprints.js';

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
      {
        name: 'instantiate_session_blueprint',
        description:
          'Instantiate an authored session blueprint into create_session-compatible phases for a concrete task.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            blueprint_id: { type: 'string' },
            task: { type: 'string' },
          },
          required: ['blueprint_id', 'task'],
        },
      },
      {
        name: 'list_session_blueprints',
        description:
          'List authored session blueprints that can be instantiated into a ready-to-validate plan.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
    handlers: {
      fork_session: handleForkSession,
      list_lineage: handleListLineage,
      list_checkpoints: handleListCheckpoints,
      restore_checkpoint: handleRestoreCheckpoint,
      instantiate_session_blueprint: handleInstantiateSessionBlueprint,
      list_session_blueprints: handleListSessionBlueprints,
    },
  });
}

export { createToolPack };
