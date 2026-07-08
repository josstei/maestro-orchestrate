import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
function isRenderableEntryConfig(value) {
    return (value != null &&
        typeof value === 'object' &&
        'templateFile' in value &&
        'outputPath' in value &&
        typeof value.templateFile === 'string' &&
        typeof value.outputPath === 'function');
}
/**
 * Fail-closed validation that a runtime declares a well-formed generation descriptor.
 *
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
 */
function getAgentToolDialect(runtime) {
    return Object.prototype.hasOwnProperty.call(runtime, 'agentToolDialect')
        ? runtime.agentToolDialect ?? null
        : null;
}
/**
 * Resolve one already-enumerated runtime config by name (no directory scan). The
 * generator's enumeration entry point (src/tooling/generate.ts:loadRuntimes) remains the
 * single discovery pass; this accessor resolves a runtime the generator already knows.
 *
 */
function resolveRuntimeConfigPath(name, srcDir) {
    const sourceConfigPath = path.join(srcDir, 'platforms', name, 'runtime-config.js');
    if (fs.existsSync(sourceConfigPath)) {
        return sourceConfigPath;
    }
    const compiledConfigPath = path.join(path.dirname(srcDir), 'dist', 'src', 'platforms', name, 'runtime-config.js');
    if (fs.existsSync(compiledConfigPath)) {
        return compiledConfigPath;
    }
    return null;
}
async function getRuntimeConfig(name, srcDir) {
    const configPath = resolveRuntimeConfigPath(name, srcDir);
    if (!configPath) {
        throw new Error(`Unknown runtime "${name}": no config under ${srcDir}`);
    }
    const { default: config } = await import(pathToFileURL(configPath).href);
    return config;
}
export { assertValidRuntimeGeneration, getRuntimeGeneration, getAgentToolDialect, getRuntimeConfig };
