'use strict';

/**
 * Maestro settings in canonical order. resolve_settings reports them in this
 * order, and the Qwen extension manifest lists them as `settings`.
 * @type {ReadonlyArray<{ name: string, description: string, envVar: string }>}
 */
const MAESTRO_SETTINGS = Object.freeze([
  ['Disabled Agents', 'MAESTRO_DISABLED_AGENTS',
    'Comma-separated list of agent names to exclude from implementation planning.'],
  ['Max Retries', 'MAESTRO_MAX_RETRIES', 'Maximum retry attempts per phase before escalating to user.'],
  ['Auto Archive', 'MAESTRO_AUTO_ARCHIVE',
    'Automatically archive session state on successful completion (true/false).'],
  ['Validation', 'MAESTRO_VALIDATION_STRICTNESS', 'Post-phase validation strictness level (strict/normal/lenient).'],
  ['State Directory', 'MAESTRO_STATE_DIR', 'Base directory for session state and plans (default: docs/maestro).'],
  ['Max Concurrent', 'MAESTRO_MAX_CONCURRENT',
    'Maximum subagents emitted in one native parallel batch turn (0 = dispatch the entire ready batch).'],
  ['Execution Mode', 'MAESTRO_EXECUTION_MODE',
    "Phase 3 execution mode: 'parallel' (native concurrent subagents), 'sequential' (one at a time), or 'ask' (prompt each time). Default: ask."],
].map(([name, envVar, description]) => ({ name, description, envVar })));

module.exports = { MAESTRO_SETTINGS };
