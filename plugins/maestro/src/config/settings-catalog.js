'use strict';

/**
 * Maestro settings in canonical order. resolve_settings reports them in this
 * order, and the Gemini/Qwen extension manifests list them as `settings`.
 * @type {ReadonlyArray<{ name: string, description: string, envVar: string }>}
 */
const MAESTRO_SETTINGS = Object.freeze([
  {
    name: 'Disabled Agents',
    description: 'Comma-separated list of agent names to exclude from implementation planning.',
    envVar: 'MAESTRO_DISABLED_AGENTS',
  },
  {
    name: 'Max Retries',
    description: 'Maximum retry attempts per phase before escalating to user.',
    envVar: 'MAESTRO_MAX_RETRIES',
  },
  {
    name: 'Auto Archive',
    description: 'Automatically archive session state on successful completion (true/false).',
    envVar: 'MAESTRO_AUTO_ARCHIVE',
  },
  {
    name: 'Validation',
    description: 'Post-phase validation strictness level (strict/normal/lenient).',
    envVar: 'MAESTRO_VALIDATION_STRICTNESS',
  },
  {
    name: 'State Directory',
    description: 'Base directory for session state and plans (default: docs/maestro).',
    envVar: 'MAESTRO_STATE_DIR',
  },
  {
    name: 'Max Concurrent',
    description: 'Maximum subagents emitted in one native parallel batch turn (0 = dispatch the entire ready batch).',
    envVar: 'MAESTRO_MAX_CONCURRENT',
  },
  {
    name: 'Execution Mode',
    description: "Phase 3 execution mode: 'parallel' (native concurrent subagents), 'sequential' (one at a time), or 'ask' (prompt each time). Default: ask.",
    envVar: 'MAESTRO_EXECUTION_MODE',
  },
]);

module.exports = { MAESTRO_SETTINGS };
