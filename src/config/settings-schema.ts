import { z } from 'zod';

const EXECUTION_MODES = ['ask', 'parallel', 'sequential'] as const;
const VALIDATION_STRICTNESS_LEVELS = ['strict', 'normal', 'lenient'] as const;

export type ExecutionMode = typeof EXECUTION_MODES[number];
export type ValidationStrictness = typeof VALIDATION_STRICTNESS_LEVELS[number];

export interface SettingPresentation {
  readonly label: string;
  readonly description: string;
  readonly usage: string;
  readonly valueHint: string;
  readonly extensionVisible: boolean;
  readonly documented: boolean;
}

export interface SettingSpec<TSchema extends z.ZodTypeAny> {
  readonly schema: TSchema;
  readonly default: z.output<TSchema>;
  readonly presentation: SettingPresentation;
}

function defineSetting<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  defaultValue: z.output<TSchema>,
  presentation: SettingPresentation,
): SettingSpec<TSchema> {
  return { schema, default: defaultValue, presentation };
}

function coerceFiniteNumber(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function coerceBoolean(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return value;
}

function coerceCsv(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Canonical declaration of every MAESTRO_* setting: its schema and its
 * declared default. This is the single source of truth for the known-setting
 * set (consumed by the MCP resolve handler) and for typed resolution.
 */
const SETTINGS_SCHEMA = {
  MAESTRO_ARCHIVE_RETENTION: defineSetting(
    z.preprocess(coerceFiniteNumber, z.number().int().min(0)),
    0,
    {
      label: 'Archive Retention',
      description: 'Maximum archived-session documents to retain; 0 keeps all archives.',
      usage: 'Bound retained archived-session documents without pruning durable memory.',
      valueHint: 'non-negative integer (0 = unlimited)',
      extensionVisible: false,
      documented: false,
    },
  ),
  MAESTRO_DISABLED_AGENTS: defineSetting(
    z.preprocess(coerceCsv, z.array(z.string())),
    [],
    {
      label: 'Disabled Agents',
      description: 'Comma-separated list of agent names to exclude from implementation planning.',
      usage: 'Exclude named agents from planning and delegation.',
      valueHint: 'comma-separated agent names',
      extensionVisible: true,
      documented: true,
    },
  ),
  MAESTRO_MAX_RETRIES: defineSetting(
    z.preprocess(coerceFiniteNumber, z.number().int().min(0)),
    2,
    {
      label: 'Max Retries',
      description: 'Maximum retry attempts per phase before escalating to user.',
      usage: 'Limit automatic phase retries before escalation.',
      valueHint: 'non-negative integer',
      extensionVisible: true,
      documented: true,
    },
  ),
  MAESTRO_AUTO_ARCHIVE: defineSetting(
    z.preprocess(coerceBoolean, z.boolean()),
    false,
    {
      label: 'Auto Archive',
      description: 'Automatically archive session state on successful completion (true/false).',
      usage: 'Archive completed sessions automatically when true; prompt when false.',
      valueHint: 'true, false',
      extensionVisible: true,
      documented: true,
    },
  ),
  MAESTRO_VALIDATION_STRICTNESS: defineSetting(
    z.enum(VALIDATION_STRICTNESS_LEVELS),
    'normal',
    {
      label: 'Validation',
      description: 'Post-phase validation strictness level (strict/normal/lenient).',
      usage: 'Select strict, normal, or lenient validation gating.',
      valueHint: 'strict, normal, lenient',
      extensionVisible: true,
      documented: true,
    },
  ),
  MAESTRO_STATE_DIR: defineSetting(
    z.string(),
    'docs/maestro',
    {
      label: 'State Directory',
      description: 'Base directory for session state and plans (default: docs/maestro).',
      usage: 'Choose the workspace-relative session and plan state root.',
      valueHint: 'path',
      extensionVisible: true,
      documented: true,
    },
  ),
  MAESTRO_MAX_CONCURRENT: defineSetting(
    z.preprocess(coerceFiniteNumber, z.number().int().min(0)),
    0,
    {
      label: 'Max Concurrent',
      description: 'Maximum subagents emitted in one native parallel batch turn (0 = dispatch the entire ready batch).',
      usage: 'Bound the native parallel dispatch chunk size.',
      valueHint: 'non-negative integer (0 = entire ready batch)',
      extensionVisible: true,
      documented: true,
    },
  ),
  MAESTRO_EXECUTION_MODE: defineSetting(
    z.enum(EXECUTION_MODES),
    'ask',
    {
      label: 'Execution Mode',
      description: "Phase 3 execution mode: 'parallel' (native concurrent subagents), 'sequential' (one at a time), or 'ask' (prompt each time). Default: ask.",
      usage: 'Choose parallel or sequential execution, or ask at the execution gate.',
      valueHint: 'ask, parallel, sequential',
      extensionVisible: true,
      documented: true,
    },
  ),
  MAESTRO_KNOWLEDGE_DIR: defineSetting(
    z.string(),
    '~/.maestro/knowledge',
    {
      label: 'Knowledge Directory',
      description: 'Private out-of-tree directory for cross-project knowledge notes.',
      usage: 'Choose the private cross-project knowledge-store directory.',
      valueHint: 'path',
      extensionVisible: false,
      documented: false,
    },
  ),
  MAESTRO_MEMORY_INJECTION: defineSetting(
    z.preprocess(coerceBoolean, z.boolean()),
    true,
    {
      label: 'Memory Injection',
      description: 'Inject recalled project memory as overridable defaults during design and planning.',
      usage: 'Enable or disable project-memory injection before Plan Mode.',
      valueHint: 'true, false',
      extensionVisible: false,
      documented: false,
    },
  ),
};

type SettingsSchema = typeof SETTINGS_SCHEMA;
export type SettingName = keyof SettingsSchema;
export type SettingValue<N extends SettingName> = z.output<SettingsSchema[N]['schema']>;
export type EffectiveSettings = { [N in SettingName]?: SettingValue<N> };

const SETTING_NAMES = Object.keys(SETTINGS_SCHEMA) as SettingName[];
export { SETTINGS_SCHEMA, SETTING_NAMES, EXECUTION_MODES, VALIDATION_STRICTNESS_LEVELS };
