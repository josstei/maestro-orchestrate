import { z } from 'zod';
import {
  withArgsOnly,
  withRequiredProjectRoot,
} from '../../src/mcp/tool-packs/command-table.js';
import {
  defineToolPack,
  registerToolPack,
  toolSchemas,
  type ToolArgs,
  type ToolResult,
} from '../../src/mcp/tool-packs/tool-pack.js';
import type { MaestroToolRegistry } from '../../src/mcp/server/tool-types.js';

const greetInput = {
  name: z.string(),
};
const idInput = {
  id: z.string(),
};

type GreetArgs = ToolArgs<typeof greetInput>;
type IdArgs = ToolArgs<typeof idInput>;

const falseDefaultPack = defineToolPack({ requiresWorkspace: false }, (tool) => ({
  greet: tool.tool({
    inputSchema: greetInput,
    description: 'Greet a person.',
    handler: withArgsOnly((args: GreetArgs) => ({ greeting: args.name.toUpperCase() })),
  }),
  forced_required: tool.required({
    inputSchema: idInput,
    description: 'Use a required project root.',
    handler: withRequiredProjectRoot((args: IdArgs, projectRoot) => ({
      id: args.id,
      projectRoot,
    })),
  }),
  explicit_optional: tool.optional({
    inputSchema: {},
    description: 'Remain workspace-independent.',
    handler: withArgsOnly(() => ({ ok: true as const })),
  }),
}));

const trueDefaultPack = defineToolPack({ requiresWorkspace: true }, (tool) => ({
  inherited_required: tool.tool({
    inputSchema: idInput,
    description: 'Inherit the required workspace policy.',
    handler: withRequiredProjectRoot((args: IdArgs, projectRoot) => ({
      id: args.id,
      projectRoot,
    })),
  }),
  forced_optional: tool.optional({
    inputSchema: {},
    description: 'Override the default workspace policy.',
    handler: withArgsOnly(() => ({ ok: true as const })),
  }),
}));

const inheritedFalse: false = falseDefaultPack.tools.greet.requiresWorkspace;
const forcedTrue: true = falseDefaultPack.tools.forced_required.requiresWorkspace;
const inheritedTrue: true = trueDefaultPack.tools.inherited_required.requiresWorkspace;
const forcedFalse: false = trueDefaultPack.tools.forced_optional.requiresWorkspace;

type GreetingResult = ToolResult<typeof falseDefaultPack.tools.greet>;
const greetingResult: GreetingResult = { greeting: 'ADA' };
greetingResult.greeting.toLowerCase();

// @ts-expect-error result inference excludes fields the handler did not return.
greetingResult.missing;

// @ts-expect-error inferred greeting result requires a string.
const invalidGreetingResult: GreetingResult = { greeting: 42 };

const projectedSchemas = toolSchemas(falseDefaultPack);
projectedSchemas.greet.name.parse('Ada');

// @ts-expect-error schema projection preserves each tool's exact value shape.
projectedSchemas.greet.missing_field;

// @ts-expect-error schema projection preserves the exact tool keys.
projectedSchemas.missing_tool;

defineToolPack({ requiresWorkspace: false }, (tool) => ({
  invalid_required_projection: tool.tool({
    inputSchema: idInput,
    description: 'Invalid inherited policy.',
    // @ts-expect-error required-project-root projection requires an effective true workspace policy.
    handler: withRequiredProjectRoot((args: IdArgs, projectRoot) => ({
      id: args.id,
      projectRoot,
    })),
  }),
}));

function definePackWithWidenedDefault(requiresWorkspace: boolean) {
  return defineToolPack({ requiresWorkspace }, (tool) => ({
    valid_widened_projection: tool.tool({
      inputSchema: greetInput,
      description: 'A widened default remains valid for non-required projections.',
      handler: withArgsOnly((args: GreetArgs) => ({ greeting: args.name.toUpperCase() })),
    }),
    invalid_widened_projection: tool.tool({
      inputSchema: idInput,
      description: 'A widened default cannot prove a required workspace policy.',
      // @ts-expect-error widened boolean defaults cannot authorize a required-project-root projection.
      handler: withRequiredProjectRoot((args: IdArgs, projectRoot) => ({
        id: args.id,
        projectRoot,
      })),
    }),
  }));
}

declare const widenedWorkspacePolicy: boolean;
const widenedDefaultPack = definePackWithWidenedDefault(widenedWorkspacePolicy);
const widenedRequirement: boolean =
  widenedDefaultPack.tools.valid_widened_projection.requiresWorkspace;
type WidenedGreetingResult = ToolResult<
  typeof widenedDefaultPack.tools.valid_widened_projection
>;
const widenedGreetingResult: WidenedGreetingResult = { greeting: 'GRACE' };
widenedGreetingResult.greeting.toLowerCase();

declare const server: {
  registerTool<TRegisteredArgs = unknown>(
    name: string,
    config: { description?: string | undefined; inputSchema?: unknown },
    callback: (args: TRegisteredArgs, extra: { signal?: AbortSignal }) => Promise<unknown>,
  ): unknown;
};
declare const registry: MaestroToolRegistry;

registerToolPack(falseDefaultPack, {
  server,
  registry,
  runtimeConfig: {},
});
