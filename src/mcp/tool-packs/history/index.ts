import { z } from 'zod';
import {
  withArgsOnly,
  withRequiredProjectRoot,
} from '../command-table.js';
import { defineToolPack, registerToolPack, toolSchemas } from '../tool-pack.js';
import { PHASE_ID } from '../zod-fragments.js';
import { handleForkSession, handleListLineage } from '../../handlers/session-lineage.js';
import { handleListCheckpoints, handleRestoreCheckpoint } from '../../handlers/checkpoints.js';
import { handleInstantiateSessionBlueprint, handleListSessionBlueprints } from '../../handlers/session-blueprints.js';

const historyToolPack = defineToolPack({ requiresWorkspace: true }, (tool) => ({
  fork_session: tool.tool({
    inputSchema: {
      source_session_id: z.string(),
      new_session_id: z.string(),
      branch: z.string().nullable().optional(),
    },
    description:
      'Fork an archived Maestro session into a new active session, recording parent_session_id and an optional branch label.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleForkSession(args, projectRoot)),
  }),
  list_lineage: tool.tool({
    inputSchema: {
      session_id: z.string(),
    },
    description:
      'Return a session parent and direct children by scanning the active session and archived sessions.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleListLineage(args, projectRoot)),
  }),
  list_checkpoints: tool.tool({
    inputSchema: {
      session_id: z.string(),
    },
    description:
      'List append-only per-phase checkpoints captured for an active Maestro session.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleListCheckpoints(args, projectRoot)),
  }),
  restore_checkpoint: tool.tool({
    inputSchema: {
      session_id: z.string(),
      phase_id: PHASE_ID,
    },
    description:
      'Restore a captured phase checkpoint by transforming future phases back to pending state.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleRestoreCheckpoint(args, projectRoot)),
  }),
  instantiate_session_blueprint: tool.tool({
    inputSchema: {
      blueprint_id: z.string(),
      task: z.string(),
    },
    description:
      'Instantiate an authored session blueprint into create_session-compatible phases for a concrete task.',
    handler: withArgsOnly((args) => handleInstantiateSessionBlueprint(args)),
  }),
  list_session_blueprints: tool.tool({
    inputSchema: {},
    description:
      'List authored session blueprints that can be instantiated into a ready-to-validate plan.',
    handler: withArgsOnly(() => handleListSessionBlueprints()),
  }),
}));

const zodSchemas = toolSchemas(historyToolPack);

/**
 * Register the `history` pack's 6 co-located descriptors through the shared
 * command-table pipeline. Every tool in this pack requires an initialized
 * workspace.
 *
 * @param {{server: object, registry: object}} options
 */
function registerHistoryPack({ server, registry, ...contextOptions }: any = {}) {
  registerToolPack(historyToolPack, {
    server,
    registry,
    ...contextOptions,
  });
}

export { registerHistoryPack, zodSchemas };
