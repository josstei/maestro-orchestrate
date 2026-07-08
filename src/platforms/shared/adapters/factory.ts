import { readBoundedJson } from '../../../core/stdin-reader.js';
import { EXIT_SUCCESS } from './exit-codes.js';

export interface HookContext {
  readonly sessionId: string;
  readonly cwd: string;
  readonly event: string;
  readonly agentName: string | null;
  readonly agentInput: string | null;
  readonly agentResult: unknown;
  readonly stopHookActive: boolean;
  readonly transcriptPath?: string;
  readonly permissionMode?: string;
  readonly agentId?: string;
  readonly source?: string;
  readonly model?: string;
  readonly reason?: string;
}

export interface HookResult {
  readonly action: 'allow' | 'deny';
  readonly message?: string | null;
  readonly reason?: string | null;
}

export type RuntimeHookOutput = Record<string, unknown>;

export interface RuntimeAdapterSpec {
  readonly normalizeInput: (raw: Record<string, any>) => HookContext;
  readonly formatOutput: (result: HookResult) => RuntimeHookOutput;
  readonly errorFallback: () => RuntimeHookOutput;
  readonly readBoundedStdin?: () => Promise<unknown>;
  readonly getExitCode?: (result: HookResult) => number;
}

export interface RuntimeAdapter extends Required<RuntimeAdapterSpec> {}

/**
 * Adapter contract expected by `hook-runner.js`:
 *   normalizeInput(raw)  -> ctx       (runtime stdin -> internal context)
 *   formatOutput(result) -> object    (internal result -> runtime stdout)
 *   errorFallback()      -> object    (emitted on uncaught adapter errors)
 *   readBoundedStdin()   -> Promise   (parse stdin as JSON, bounded size)
 *   getExitCode(result)  -> number    (process exit code; defaults to 0)
 *
 * `defineAdapter` is a spec-assembler: it validates a caller-provided
 * spec and fills in shared defaults (stdin reader, success-exit fallback)
 * so each runtime adapter only declares its protocol-specific
 * normalize/format/fallback/exit logic. Registry dispatch by runtime
 * name is done separately by `hook-runner.js`.
 */
function defineAdapter(spec: RuntimeAdapterSpec): RuntimeAdapter {
  if (!spec || typeof spec.normalizeInput !== 'function') {
    throw new TypeError('Adapter spec must provide normalizeInput(raw)');
  }
  if (typeof spec.formatOutput !== 'function') {
    throw new TypeError('Adapter spec must provide formatOutput(result)');
  }
  if (typeof spec.errorFallback !== 'function') {
    throw new TypeError('Adapter spec must provide errorFallback()');
  }

  return {
    normalizeInput: spec.normalizeInput,
    formatOutput: spec.formatOutput,
    errorFallback: spec.errorFallback,
    readBoundedStdin: spec.readBoundedStdin || readBoundedJson,
    getExitCode: spec.getExitCode || (() => EXIT_SUCCESS),
  };
}

export { defineAdapter };
