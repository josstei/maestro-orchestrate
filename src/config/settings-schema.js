import { string, integer, boolean, enumOf, csv } from '../lib/schema/index.js';
const EXECUTION_MODES = ['ask', 'parallel', 'sequential'];
const VALIDATION_STRICTNESS_LEVELS = ['strict', 'normal', 'lenient'];

/**
 * Canonical declaration of every MAESTRO_* setting: its schema and its
 * declared default. This is the single source of truth for the known-setting
 * set (consumed by the MCP resolve handler) and for typed resolution.
 * @type {Record<string, { schema: object, default: * }>}
 */
const SETTINGS_SCHEMA = {
  MAESTRO_ARCHIVE_RETENTION: { schema: integer({ min: 0 }), default: 0 },
  MAESTRO_DISABLED_AGENTS: { schema: csv(string()), default: [] },
  MAESTRO_MAX_RETRIES: { schema: integer({ min: 0 }), default: 2 },
  MAESTRO_AUTO_ARCHIVE: { schema: boolean(), default: false },
  MAESTRO_VALIDATION_STRICTNESS: { schema: enumOf(VALIDATION_STRICTNESS_LEVELS), default: 'normal' },
  MAESTRO_STATE_DIR: { schema: string(), default: 'docs/maestro' },
  MAESTRO_MAX_CONCURRENT: { schema: integer({ min: 0 }), default: 0 },
  MAESTRO_EXECUTION_MODE: { schema: enumOf(EXECUTION_MODES), default: 'ask' },
  MAESTRO_KNOWLEDGE_DIR: { schema: string(), default: '~/.maestro/knowledge' },
  MAESTRO_MEMORY_INJECTION: { schema: boolean(), default: true },
};

const SETTING_NAMES = Object.keys(SETTINGS_SCHEMA);
export { SETTINGS_SCHEMA, SETTING_NAMES, EXECUTION_MODES, VALIDATION_STRICTNESS_LEVELS };
