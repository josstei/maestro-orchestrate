import { defineTool } from './contracts.js';
import type { HandlerContext, HandlerContextOptions, MaybePromise, MaestroToolRegistry, ToolHandler, ToolPostCall } from '../server/tool-types.js';
import type { z } from 'zod';

export type ToolSchemaMap = Record<string, z.ZodRawShape>;

export type ToolArgs<TShape extends z.ZodRawShape> = z.infer<z.ZodObject<TShape>>;

type ProjectionKind =
  | 'handler-context'
  | 'required-project-root'
  | 'optional-project-root'
  | 'args-only';

type ProjectedHandler<TArgs, TResult, TKind extends ProjectionKind> = {
  kind: TKind;
  toHandler: ToolHandler<TArgs, TResult>;
  onPostCall?: ToolPostCall<TArgs, TResult> | undefined;
};

type HandlerProjection<TArgs, TResult> =
  | ProjectedHandler<TArgs, TResult, 'handler-context'>
  | ProjectedHandler<TArgs, TResult, 'optional-project-root'>
  | ProjectedHandler<TArgs, TResult, 'args-only'>;

type RequiredProjectRootProjection<TArgs, TResult> =
  ProjectedHandler<TArgs, TResult, 'required-project-root'>;

type BaseCommandDefinition<TName extends string, TShape extends z.ZodRawShape, TResult> = {
  name?: TName;
  description?: string;
  onPostCall?: ToolPostCall<ToolArgs<TShape>, TResult>;
};

export type CommandDefinition<TName extends string, TShape extends z.ZodRawShape, TResult = unknown> =
  | (BaseCommandDefinition<TName, TShape, TResult> & {
      requiresWorkspace: true;
      handler: HandlerProjection<ToolArgs<TShape>, TResult> | RequiredProjectRootProjection<ToolArgs<TShape>, TResult>;
    })
  | (BaseCommandDefinition<TName, TShape, TResult> & {
      requiresWorkspace?: false;
      handler: HandlerProjection<ToolArgs<TShape>, TResult>;
    });

export type CommandTable<TSchemas extends ToolSchemaMap> = {
  [TName in keyof TSchemas & string]: CommandDefinition<TName, TSchemas[TName], any>;
};

type RegisterCommandTableOptions = HandlerContextOptions & {
  server: {
    registerTool<TRegisteredArgs = unknown>(
      name: string,
      config: { description?: string | undefined; inputSchema?: unknown },
      callback: (args: TRegisteredArgs, extra: { signal?: AbortSignal }) => Promise<unknown>,
    ): unknown;
  };
  registry: MaestroToolRegistry;
};

function project<TArgs, TResult, TKind extends ProjectionKind>(
  kind: TKind,
  toHandler: ToolHandler<TArgs, TResult>,
): ProjectedHandler<TArgs, TResult, TKind> {
  return { kind, toHandler };
}

function withHandlerContext<TArgs, TResult>(
  handler: (args: TArgs, ctx: HandlerContext) => MaybePromise<TResult>,
): ProjectedHandler<TArgs, TResult, 'handler-context'> {
  return project('handler-context', handler);
}

function withRequiredProjectRoot<TArgs, TResult>(
  handler: (args: TArgs, projectRoot: string) => MaybePromise<TResult>,
): RequiredProjectRootProjection<TArgs, TResult> {
  return project('required-project-root', (args, ctx) => handler(args, ctx.projectRoot as string));
}

function withOptionalProjectRoot<TArgs, TResult>(
  handler: (args: TArgs, projectRoot: string | null) => MaybePromise<TResult>,
): ProjectedHandler<TArgs, TResult, 'optional-project-root'> {
  return project('optional-project-root', (args, ctx) => handler(args, ctx.projectRoot));
}

function withArgsOnly<TArgs, TResult>(
  handler: (args: TArgs) => MaybePromise<TResult>,
): ProjectedHandler<TArgs, TResult, 'args-only'> {
  return project('args-only', (args) => handler(args));
}

function withPostCall<TArgs, TResult, TKind extends ProjectionKind>(
  handler: ProjectedHandler<TArgs, TResult, TKind>,
  onPostCall: ToolPostCall<TArgs, TResult>,
): ProjectedHandler<TArgs, TResult, TKind> {
  return { ...handler, onPostCall };
}

function defineCommandTable<TSchemas extends ToolSchemaMap>(
  schemas: TSchemas,
  commands: CommandTable<TSchemas>,
): CommandTable<TSchemas> {
  const schemaKeys = Object.keys(schemas).sort();
  const commandKeys = Object.keys(commands).sort();

  if (schemaKeys.length !== commandKeys.length || schemaKeys.some((key, index) => key !== commandKeys[index])) {
    throw new Error(
      `Command table keys must match schema keys. Schemas: ${schemaKeys.join(', ')}; commands: ${commandKeys.join(', ')}`,
    );
  }

  for (const name of commandKeys) {
    const command = commands[name as keyof typeof commands];
    if (command.handler.kind === 'required-project-root' && command.requiresWorkspace !== true) {
      throw new Error(`Command "${name}" uses required project root projection and must set requiresWorkspace: true.`);
    }
  }

  return commands;
}

function registerCommandTable<TSchemas extends ToolSchemaMap>(
  schemas: TSchemas,
  commands: CommandTable<TSchemas>,
  options: RegisterCommandTableOptions,
) {
  defineCommandTable(schemas, commands);

  for (const name of Object.keys(schemas) as Array<keyof TSchemas & string>) {
    const schema = schemas[name];
    const command = commands[name];
    if (!schema || !command) {
      throw new Error(`Missing command declaration for "${name}".`);
    }

    const definition = {
      ...options,
      name,
      schema,
      handler: command.handler.toHandler,
      requiresWorkspace: command.requiresWorkspace === true,
      onPostCall: command.onPostCall ?? command.handler.onPostCall,
    };
    defineTool(
      command.description === undefined
        ? definition
        : { ...definition, description: command.description },
    );
  }
}

export {
  defineCommandTable,
  registerCommandTable,
  withArgsOnly,
  withHandlerContext,
  withOptionalProjectRoot,
  withPostCall,
  withRequiredProjectRoot,
};
