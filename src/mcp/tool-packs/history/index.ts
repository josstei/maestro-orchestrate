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
    handler: withRequiredProjectRoot((args, projectRoot) => handleForkSession(args, projectRoot)),
  },
  list_lineage: {
    description:
      'Return a session parent and direct children by scanning the active session and archived sessions.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleListLineage(args, projectRoot)),
  },
  list_checkpoints: {
    description:
      'List append-only per-phase checkpoints captured for an active Maestro session.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleListCheckpoints(args, projectRoot)),
  },
  restore_checkpoint: {
    description:
      'Restore a captured phase checkpoint by transforming future phases back to pending state.',
    handler: withRequiredProjectRoot((args, projectRoot) => handleRestoreCheckpoint(args, projectRoot)),
  },
  instantiate_session_blueprint: {
    description:
      'Instantiate an authored session blueprint into create_session-compatible phases for a concrete task.',
    handler: withArgsOnly((args) => handleInstantiateSessionBlueprint(args)),
  },
  list_session_blueprints: {
    description:
      'List authored session blueprints that can be instantiated into a ready-to-validate plan.',
    handler: withArgsOnly(() => handleListSessionBlueprints()),
  },
}, { requiresWorkspace: true });

function registerHistoryPack({ server, registry, ...contextOptions }: any = {}) {
  registerCommandTable(zodSchemas, historyCommands, {
    server,
    registry,
    ...contextOptions,
  });
}

export { registerHistoryPack, zodSchemas };
