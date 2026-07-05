import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {Object} EntryPointDescriptor
 * @property {string} templateFile - Template basename under src/entry-points/templates/.
 * @property {(entry: { name: string }) => string} outputPath - Maps a runtime-resolved entry to its output path.
 * @property {string} preamblePlaceholder - Substitution key filled by the runtime's preamble builder.
 */

/**
 * @typedef {Object} CoreCommandDescriptor
 * @property {string} templateFile - Template basename under src/entry-points/templates/.
 * @property {(entry: { name: string }) => string} outputPath - Maps a core-command entry to its output path.
 */

/**
 * @typedef {Object} HookDescriptor
 * @property {'gemini-family' | 'claude'} family - Selects the hook-config renderer.
 * @property {string} configOutputPath - Output path for the emitted hook config.
 */

/**
 * @typedef {Object} RuntimeGenerationDescriptor
 * @property {EntryPointDescriptor | null} entryPoint - Standalone entry-point config, or null when the runtime emits none.
 * @property {CoreCommandDescriptor | null} coreCommand - Core-command config, or null when the runtime emits none.
 * @property {HookDescriptor | null} hooks - Hook-config descriptor, or null when the runtime has no Maestro hook surface.
 */

function isRenderableEntryConfig(value) {
  return (
    value != null &&
    typeof value.templateFile === 'string' &&
    typeof value.outputPath === 'function'
  );
}

/**
 * Fail-closed validation that a runtime declares a well-formed generation descriptor.
 *
 * @param {string} name - Runtime name (for error messages).
 * @param {RuntimeGenerationDescriptor} generation - The descriptor to validate.
 * @throws {Error} When the descriptor is absent or any declared sub-descriptor is malformed.
 */
function assertValidRuntimeGeneration(name, generation) {
  if (!generation || typeof generation !== 'object') {
    throw new Error(`Runtime "${name}" is missing its generation descriptor`);
  }

  const { entryPoint, coreCommand, hooks } = generation;

  if (entryPoint !== null) {
    if (!isRenderableEntryConfig(entryPoint) || typeof entryPoint.preamblePlaceholder !== 'string') {
      throw new Error(`Runtime "${name}" has a malformed entryPoint descriptor`);
    }
  }

  if (coreCommand !== null && !isRenderableEntryConfig(coreCommand)) {
    throw new Error(`Runtime "${name}" has a malformed coreCommand descriptor`);
  }

  if (hooks !== null) {
    if (hooks.family !== 'gemini-family' && hooks.family !== 'claude') {
      throw new Error(`Runtime "${name}" declares an unknown hook family "${hooks.family}"`);
    }
    if (typeof hooks.configOutputPath !== 'string') {
      throw new Error(`Runtime "${name}" has a malformed hooks descriptor`);
    }
  }
}

/**
 * Validated read of a runtime config's generation descriptor.
 *
 * @param {{ name: string, generation?: RuntimeGenerationDescriptor }} config
 * @returns {RuntimeGenerationDescriptor}
 */
function getRuntimeGeneration(config) {
  assertValidRuntimeGeneration(config.name, config.generation);
  return config.generation;
}

/**
 * Return a runtime's agent-frontmatter tool dialect (canonical token -> runtime token
 * override map), or null when the runtime does not diverge from the canonical vocabulary
 * and therefore declares none. An empty map is a real declaration meaning identity.
 *
 * @param {{ agentToolDialect?: Record<string, string | string[]> }} runtime
 * @returns {Record<string, string | string[]> | null}
 */
function getAgentToolDialect(runtime) {
  return Object.prototype.hasOwnProperty.call(runtime, 'agentToolDialect')
    ? runtime.agentToolDialect
    : null;
}

/**
 * Resolve one already-enumerated runtime config by name (no directory scan). The
 * generator's enumeration entry point (scripts/generate.js:loadRuntimes) remains the
 * single discovery pass; this accessor resolves a runtime the generator already knows.
 *
 * @param {string} name - Runtime name.
 * @param {string} srcDir - Absolute path to the src/ directory.
 * @returns {object} The runtime config.
 * @throws {Error} When no runtime-config.js exists for `name`.
 */
async function getRuntimeConfig(name, srcDir) {
  const configPath = path.join(srcDir, 'platforms', name, 'runtime-config.js');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Unknown runtime "${name}": no config at ${configPath}`);
  }
  const { default: config } = await import(pathToFileURL(configPath).href);
  return config;
}

export { assertValidRuntimeGeneration, getRuntimeGeneration, getAgentToolDialect, getRuntimeConfig };
