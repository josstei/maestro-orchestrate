import { z } from 'zod';
import { defineTool } from '../../src/mcp/tool-packs/contracts.js';
import {
  defineCommandTable,
  registerCommandTable,
  withArgsOnly,
  withHandlerContext,
  withOptionalProjectRoot,
  withPostCall,
  withRequiredProjectRoot,
  type CommandTable,
  type HandlerFor,
  type ToolArgs,
  type ToolSchemaMap,
} from '../../src/mcp/tool-packs/command-table.js';
import type { MaestroToolRegistry } from '../../src/mcp/server/tool-types.js';

declare const server: {
  registerTool<TRegisteredArgs = unknown>(
    name: string,
    config: { description?: string | undefined; inputSchema?: unknown },
    callback: (args: TRegisteredArgs, extra: { signal?: AbortSignal }) => Promise<unknown>,
  ): unknown;
};
declare const registry: MaestroToolRegistry;

const zodSchemas = {
  greet: {
    name: z.string(),
    count: z.number().int().optional(),
  },
  needs_workspace: {
    id: z.string(),
  },
  maybe_workspace: {},
  full_context: {
    approved: z.boolean(),
  },
} satisfies ToolSchemaMap;

type NeedsWorkspaceArgs = ToolArgs<typeof zodSchemas.needs_workspace>;

const requiredProjectRootHandler = withRequiredProjectRoot(
  (args: NeedsWorkspaceArgs, projectRoot) => ({ id: args.id, projectRoot }),
);
const workspaceHandler: HandlerFor<true, NeedsWorkspaceArgs, { id: string; projectRoot: string }> =
  requiredProjectRootHandler;

// @ts-expect-error required-project-root projections are excluded when workspace policy is false.
const nonWorkspaceHandler: HandlerFor<false, NeedsWorkspaceArgs, { id: string; projectRoot: string }> =
  requiredProjectRootHandler;

const commandTable = defineCommandTable(zodSchemas, {
  greet: {
    description: 'Greet a person.',
    handler: withPostCall(
      withArgsOnly((args) => ({
        greeting: args.name.toUpperCase(),
        count: args.count ?? 1,
      })),
      (result, args) => {
        result.greeting.toLowerCase();
        args.name.toUpperCase();
        // @ts-expect-error result does not expose undeclared fields.
        result.missing;
      },
    ),
  },
  needs_workspace: {
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => ({
      id: args.id,
      projectRoot,
    })),
  },
  maybe_workspace: {
    handler: withOptionalProjectRoot((_args, projectRoot) => ({
      projectRoot,
    })),
  },
  full_context: {
    requiresWorkspace: true,
    handler: withHandlerContext((args, ctx) => ({
      approved: args.approved,
      hasSignal: Boolean(ctx.signal),
    })),
  },
});

const defaultedSchemas = {
  inherited_required: { id: z.string() },
  explicit_optional: {},
};

const materializedDefaultCommands = defineCommandTable(
  defaultedSchemas,
  {
    inherited_required: {
      handler: withRequiredProjectRoot((args, projectRoot) => ({
        id: args.id,
        projectRoot,
      })),
    },
    explicit_optional: {
      requiresWorkspace: false,
      handler: withArgsOnly(() => ({ ok: true as const })),
    },
  },
  { requiresWorkspace: true },
);

registerCommandTable(defaultedSchemas, materializedDefaultCommands, {
  server,
  registry,
  runtimeConfig: {},
});

declare const rawTrueDefaultCommands: CommandTable<typeof defaultedSchemas, true>;
// @ts-expect-error raw defaults must be materialized through defineCommandTable before registration.
registerCommandTable(defaultedSchemas, rawTrueDefaultCommands, {
  server,
  registry,
  runtimeConfig: {},
});

defineCommandTable(
  defaultedSchemas,
  {
    // @ts-expect-error an explicit false override rejects a required-root projection.
    inherited_required: {
      requiresWorkspace: false,
      handler: withRequiredProjectRoot((args, projectRoot) => ({
        id: args.id,
        projectRoot,
      })),
    },
    explicit_optional: {
      handler: withArgsOnly(() => ({ ok: true as const })),
    },
  },
  { requiresWorkspace: true },
);

declare const widenedWorkspaceDefault: boolean;
defineCommandTable(
  defaultedSchemas,
  {
    // @ts-expect-error a widened default cannot authorize a required-root projection.
    inherited_required: {
      handler: withRequiredProjectRoot((args, projectRoot) => ({
        id: args.id,
        projectRoot,
      })),
    },
    explicit_optional: {
      handler: withArgsOnly(() => ({ ok: true as const })),
    },
  },
  { requiresWorkspace: widenedWorkspaceDefault },
);

commandTable.greet.handler.toHandler({ name: 'ada' }, {
  projectRoot: null,
  runtimeConfig: {},
  signal: undefined,
  elicit: async () => null,
  services: {} as never,
});

defineTool({
  server,
  registry,
  runtimeConfig: {},
  name: 'typed_tool',
  schema: {},
  handler: async () => ({ ok: true }),
});

// @ts-expect-error defineTool requires runtimeConfig.
defineTool({
  server,
  registry,
  name: 'missing_runtime',
  schema: {},
  handler: async () => ({ ok: true }),
});

// @ts-expect-error defineTool requires a tool name.
defineTool({
  server,
  registry,
  runtimeConfig: {},
  schema: {},
  handler: async () => ({ ok: true }),
});

// @ts-expect-error defineTool requires a handler.
defineTool({
  server,
  registry,
  runtimeConfig: {},
  name: 'missing_handler',
  schema: {},
});

defineCommandTable(zodSchemas, {
  greet: {
    handler: withArgsOnly((args) => args.name),
  },
  needs_workspace: {
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => `${projectRoot}:${args.id}`),
  },
  maybe_workspace: {
    handler: withOptionalProjectRoot((_args, projectRoot) => projectRoot),
  },
  full_context: {
    requiresWorkspace: true,
    handler: withHandlerContext((args, ctx) => ({ approved: args.approved, root: ctx.projectRoot })),
  },
});

defineCommandTable(zodSchemas, {
  greet: {
    // @ts-expect-error name is string, not number.
    handler: withArgsOnly((args: { name: number }) => args.name),
  },
  needs_workspace: {
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => `${projectRoot}:${args.id}`),
  },
  maybe_workspace: {
    handler: withOptionalProjectRoot((_args, projectRoot) => projectRoot),
  },
  full_context: {
    requiresWorkspace: true,
    handler: withHandlerContext((args, ctx) => ({ approved: args.approved, root: ctx.projectRoot })),
  },
});

defineCommandTable(zodSchemas, {
  greet: {
    handler: withArgsOnly((args) => args.name),
  },
  // @ts-expect-error required-project-root projection requires requiresWorkspace: true.
  needs_workspace: {
    handler: withRequiredProjectRoot((args, projectRoot) => `${projectRoot}:${args.id}`),
  },
  maybe_workspace: {
    handler: withOptionalProjectRoot((_args, projectRoot) => projectRoot),
  },
  full_context: {
    requiresWorkspace: true,
    handler: withHandlerContext((args, ctx) => ({ approved: args.approved, root: ctx.projectRoot })),
  },
});

defineCommandTable(zodSchemas, {
  greet: {
    handler: withArgsOnly((args) => args.name),
  },
  needs_workspace: {
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => `${projectRoot}:${args.id}`),
  },
  maybe_workspace: {
    handler: withOptionalProjectRoot((_args, projectRoot) => projectRoot),
  },
  full_context: {
    requiresWorkspace: true,
    handler: withHandlerContext((args, ctx) => ({ approved: args.approved, root: ctx.projectRoot })),
  },
  // @ts-expect-error command key is not present in zodSchemas.
  extra_tool: {
    handler: withArgsOnly(() => null),
  },
});

// @ts-expect-error full_context command is required by zodSchemas.
defineCommandTable(zodSchemas, {
  greet: {
    handler: withArgsOnly((args) => args.name),
  },
  needs_workspace: {
    requiresWorkspace: true,
    handler: withRequiredProjectRoot((args, projectRoot) => `${projectRoot}:${args.id}`),
  },
  maybe_workspace: {
    handler: withOptionalProjectRoot((_args, projectRoot) => projectRoot),
  },
});
