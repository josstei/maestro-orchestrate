import { registerCommandTable } from './command-table.js';
import type {
  CommandTable,
  HandlerFor,
  NonRequiredProjection,
  ProjectedHandler,
  ProjectionKind,
} from './command-table.js';
import type { RegisterableMcpServer } from './contracts.js';
import type { MaestroToolRegistry, ToolPipelineOptions } from '../server/tool-types.js';
import type { z } from 'zod';

export type ToolInputShape = z.ZodRawShape;
export type ToolArgs<S extends ToolInputShape> = z.output<z.ZodObject<S>>;

export type { HandlerFor, NonRequiredProjection, ProjectedHandler, ProjectionKind };

export interface ToolDescriptor<
  S extends ToolInputShape,
  R,
  Required extends boolean,
> {
  readonly inputSchema: S;
  readonly description: string;
  readonly handler: HandlerFor<Required, ToolArgs<S>, R>;
  readonly requiresWorkspace: Required;
}

export interface ToolDescriptorBuilder<DefaultRequired extends boolean> {
  tool<S extends ToolInputShape, R>(
    descriptor: Omit<ToolDescriptor<S, R, DefaultRequired>, 'requiresWorkspace'>,
  ): ToolDescriptor<S, R, DefaultRequired>;
  required<S extends ToolInputShape, R>(
    descriptor: Omit<ToolDescriptor<S, R, true>, 'requiresWorkspace'>,
  ): ToolDescriptor<S, R, true>;
  optional<S extends ToolInputShape, R>(
    descriptor: Omit<ToolDescriptor<S, R, false>, 'requiresWorkspace'>,
  ): ToolDescriptor<S, R, false>;
}

export type AnyToolDescriptor =
  | ToolDescriptor<any, any, true>
  | ToolDescriptor<any, any, false>
  | ToolDescriptor<any, any, boolean>;

export interface ToolPack<
  DefaultRequired extends boolean,
  Tools extends Record<string, AnyToolDescriptor>,
> {
  readonly defaults: { readonly requiresWorkspace: DefaultRequired };
  readonly tools: Tools;
}

type ToolPackConstraint = ToolPack<boolean, Record<string, AnyToolDescriptor>>;

export type ToolSchemaProjection<P extends ToolPackConstraint> = {
  readonly [K in keyof P['tools']]: P['tools'][K]['inputSchema'];
};

export type ToolResult<D extends AnyToolDescriptor> =
  D extends ToolDescriptor<any, infer R, any> ? R : never;

export type RegisterToolPackBaseOptions =
  Omit<ToolPipelineOptions, 'server' | 'registry'> & {
    readonly server: RegisterableMcpServer;
    readonly registry: MaestroToolRegistry;
  };

function withWorkspaceRequirement<
  S extends ToolInputShape,
  R,
  Required extends boolean,
>(
  requiresWorkspace: Required,
  descriptor: Omit<ToolDescriptor<S, R, Required>, 'requiresWorkspace'>,
): ToolDescriptor<S, R, Required> {
  return {
    inputSchema: descriptor.inputSchema,
    description: descriptor.description,
    handler: descriptor.handler,
    requiresWorkspace,
  };
}

function createToolDescriptorBuilder<DefaultRequired extends boolean>(
  requiresWorkspace: DefaultRequired,
): ToolDescriptorBuilder<DefaultRequired> {
  return {
    tool<S extends ToolInputShape, R>(
      descriptor: Omit<ToolDescriptor<S, R, DefaultRequired>, 'requiresWorkspace'>,
    ) {
      return withWorkspaceRequirement(requiresWorkspace, descriptor);
    },
    required<S extends ToolInputShape, R>(
      descriptor: Omit<ToolDescriptor<S, R, true>, 'requiresWorkspace'>,
    ) {
      return withWorkspaceRequirement(true, descriptor);
    },
    optional<S extends ToolInputShape, R>(
      descriptor: Omit<ToolDescriptor<S, R, false>, 'requiresWorkspace'>,
    ) {
      return withWorkspaceRequirement(false, descriptor);
    },
  };
}

function defineToolPack<
  const D extends boolean,
  const T extends Record<string, AnyToolDescriptor>,
>(
  defaults: { requiresWorkspace: D },
  build: (tool: ToolDescriptorBuilder<D>) => T,
): ToolPack<D, T> {
  return {
    defaults,
    tools: build(createToolDescriptorBuilder(defaults.requiresWorkspace)),
  };
}

type DescriptorEntry<T extends Record<string, AnyToolDescriptor>> = {
  [K in Extract<keyof T, string>]: [K, T[K]];
}[Extract<keyof T, string>];

function descriptorEntries<T extends Record<string, AnyToolDescriptor>>(
  value: T,
): Array<DescriptorEntry<T>> {
  return Object.entries(value) as Array<DescriptorEntry<T>>;
}

function toolSchemas<TPack extends ToolPackConstraint>(
  pack: TPack,
): ToolSchemaProjection<TPack> {
  return Object.fromEntries(
    descriptorEntries(pack.tools).map(([name, descriptor]) => [name, descriptor.inputSchema]),
  ) as ToolSchemaProjection<TPack>;
}

function registerToolPack<TPack extends ToolPackConstraint>(
  pack: TPack,
  options: RegisterToolPackBaseOptions,
): void {
  const schemas = toolSchemas(pack);
  const commands = Object.fromEntries(
    descriptorEntries(pack.tools).map(([name, descriptor]) => [
      name,
      {
        description: descriptor.description,
        requiresWorkspace: descriptor.requiresWorkspace,
        handler: descriptor.handler,
      },
    ]),
  ) as CommandTable<typeof schemas>;

  registerCommandTable(schemas, commands, options);
}

export { defineToolPack, registerToolPack, toolSchemas };
