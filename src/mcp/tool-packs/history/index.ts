import {
  defineCommandTable,
  registerCommandTable,
  withArgsOnly,
  withRequiredProjectRoot,
} from '../command-table.js';
import { zodSchemas } from './zod-schemas.js';
import { handleForkSession, handleListLineage } from '../../handlers/session-lineage.js';
import { handleListCheckpoints, handleRestoreCheckpoint } from '../../handlers/checkpoints.js';
import { handleInstantiateSessionBlueprint, handleListSessionBlueprints } from '../../handlers/session-blueprints.js';

const historyCommands = defineCommandTable(zodSchemas, {
  fork_session: {
    description:
      'Fork an archived Maestro session into a new active session, recording parent_session_id and an optional branch label.',
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => handleForkSession(args, projectRoot)),
  },
  list_lineage: {
    description:
      'Return a session parent and direct children by scanning the active session and archived sessions.',
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => handleListLineage(args, projectRoot)),
  },
  list_checkpoints: {
    description:
      'List append-only per-phase checkpoints captured for an active Maestro session.',
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => handleListCheckpoints(args, projectRoot)),
  },
  restore_checkpoint: {
    description:
      'Restore a captured phase checkpoint by transforming future phases back to pending state.',
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => handleRestoreCheckpoint(args, projectRoot)),
  },
  instantiate_session_blueprint: {
    description:
      'Instantiate an authored session blueprint into create_session-compatible phases for a concrete task.',
    requiresWorkspace: true,
    handler: withArgsOnly((args) => handleInstantiateSessionBlueprint(args)),
  },
  list_session_blueprints: {
    description:
      'List authored session blueprints that can be instantiated into a ready-to-validate plan.',
    requiresWorkspace: true,
    handler: withArgsOnly(() => handleListSessionBlueprints()),
  },
});

/**
 * Register the `history` pack's 6 tools via the command-table helper, each
 * consuming its shape from `./zod-schemas.js`. Every tool in this pack
 * requires an initialized workspace.
 *
 * @param {{server: object, registry: object}} options
 */
function registerHistoryPack({ server, registry, ...contextOptions }: any = {}) {
  registerCommandTable(zodSchemas, historyCommands, {
    server,
    registry,
    ...contextOptions,
  });
}

export { registerHistoryPack };
