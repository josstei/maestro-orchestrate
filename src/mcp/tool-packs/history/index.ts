import { defineTool } from '../contracts.js';
import { zodSchemas } from './zod-schemas.js';
import { handleForkSession, handleListLineage } from '../../handlers/session-lineage.js';
import { handleListCheckpoints, handleRestoreCheckpoint } from '../../handlers/checkpoints.js';
import { handleInstantiateSessionBlueprint, handleListSessionBlueprints } from '../../handlers/session-blueprints.js';

/**
 * Register the `history` pack's 6 tools via `defineTool`, each consuming its
 * shape from `./zod-schemas.js`. Every tool in this pack requires an
 * initialized workspace.
 *
 * @param {{server: object, registry: object}} options
 */
function registerHistoryPack({ server, registry, ...contextOptions }: any = {}) {
  const historyTools = [
    {
      name: 'fork_session',
      description:
        'Fork an archived Maestro session into a new active session, recording parent_session_id and an optional branch label.',
      handler: (args: any, ctx: any) => handleForkSession(args, ctx.projectRoot),
    },
    {
      name: 'list_lineage',
      description:
        'Return a session parent and direct children by scanning the active session and archived sessions.',
      handler: (args: any, ctx: any) => handleListLineage(args, ctx.projectRoot),
    },
    {
      name: 'list_checkpoints',
      description:
        'List append-only per-phase checkpoints captured for an active Maestro session.',
      handler: (args: any, ctx: any) => handleListCheckpoints(args, ctx.projectRoot),
    },
    {
      name: 'restore_checkpoint',
      description:
        'Restore a captured phase checkpoint by transforming future phases back to pending state.',
      handler: (args: any, ctx: any) => handleRestoreCheckpoint(args, ctx.projectRoot),
    },
    {
      name: 'instantiate_session_blueprint',
      description:
        'Instantiate an authored session blueprint into create_session-compatible phases for a concrete task.',
      handler: (args: any) => handleInstantiateSessionBlueprint(args),
    },
    {
      name: 'list_session_blueprints',
      description:
        'List authored session blueprints that can be instantiated into a ready-to-validate plan.',
      handler: () => handleListSessionBlueprints(),
    },
  ];

  for (const tool of historyTools) {
    defineTool({
      server,
      registry,
      name: tool.name,
      description: tool.description,
      requiresWorkspace: true,
      schema: (zodSchemas as Record<string, any>)[tool.name],
      handler: tool.handler,
      ...contextOptions,
    });
  }
}

export { registerHistoryPack };
