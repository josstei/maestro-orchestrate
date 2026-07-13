export type MaybePromise<T> = T | Promise<T>;

export type ToolSuccess<TResult = unknown> = {
  ok: true;
  result: TResult;
};

export type ToolFailure = {
  ok: false;
  error: string;
  recovery_hint: string | null;
  code?: string;
  details?: unknown;
};

export type ToolOutcome<TResult = unknown> = ToolSuccess<TResult> | ToolFailure;

export type CallToolJsonTextResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: true | undefined;
};

export type ElicitParams = {
  message: string;
  requestedSchema: object;
};

export type ElicitResult = {
  action: string;
  content?: object;
} | null;

export type HandlerServices = {
  canonicalSrcRoot?: string | undefined;
  workspaceSuggestion?: (() => string | null) | undefined;
};

export type HandlerContext = {
  projectRoot: string | null;
  stateDirPath: string | null;
  runtimeConfig: unknown;
  signal: AbortSignal | undefined;
  elicit: (params: ElicitParams) => Promise<ElicitResult>;
  services: HandlerServices;
};

export type ToolHandler<TArgs = unknown, TResult = unknown> = (
  args: TArgs,
  ctx: HandlerContext,
) => MaybePromise<TResult>;

export type ToolPostCall<TArgs = unknown, TResult = unknown> = (
  result: TResult,
  args: TArgs,
) => MaybePromise<void>;

export type ToolRegistryMetadata = {
  requiresWorkspace?: boolean | undefined;
};

export type MaestroToolRegistry = {
  register(name: string, metadata?: ToolRegistryMetadata): void;
  requiresWorkspace(name: string): boolean;
  has(name: string): boolean;
};

export type ToolPipelineDefinition<TArgs = unknown, TResult = unknown> = {
  name: string;
  handler: ToolHandler<TArgs, TResult>;
  onPostCall?: ToolPostCall<TArgs, TResult> | undefined;
};

export type HandlerContextOptions = {
  server: unknown;
  runtimeConfig: unknown;
  getWorkspaceState?: () => MaybePromise<{
    projectRoot: string | null;
    stateDirPath: string | null;
  }>;
  services?: HandlerServices;
};

export type ToolPipelineOptions = HandlerContextOptions & {
  registry: MaestroToolRegistry;
};
