import path from 'node:path';
import fs from 'node:fs';
import { discover, generateRegistry } from '../lib/discovery/index.js';
import { serializeRegistry } from '../lib/discovery/index.js';
import { parse } from '../lib/frontmatter/index.js';
import { toPascalCase } from '../lib/naming/index.js';
import { listAgentSources } from '../core/agent-sources.js';
import { validateRegistry } from './registry-schemas.js';
function stringValue(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}
function stringArrayValue(value) {
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string');
    }
    return typeof value === 'string' ? [value] : [];
}
function capabilityValue(value) {
    return value === 'read_shell' || value === 'read_write' || value === 'full' || value === 'read_only'
        ? value
        : 'read_only';
}
function buildAgentRegistry(srcDir) {
    return listAgentSources(srcDir).map(({ name: fallbackName, content }) => {
        const { frontmatter } = parse(content);
        const name = stringValue(frontmatter.name, fallbackName);
        const capabilities = capabilityValue(frontmatter.capabilities);
        const tools = stringArrayValue(frontmatter.tools);
        const focus = stringValue(frontmatter.focus);
        return { name, capabilities, tools, focus };
    });
}
function buildResourceRegistry(srcDir) {
    const skillsParentDir = path.join(srcDir, 'skills');
    const skillEntries = discover({
        dir: path.join(srcDir, 'skills', 'shared'),
        pattern: '**/*.md',
        identity: (filepath) => {
            if (path.basename(filepath) === 'SKILL.md') {
                return path.basename(path.dirname(filepath));
            }
            return path.basename(filepath, '.md');
        },
        metadata: (filepath) => {
            const relativePath = 'skills/' + path.relative(skillsParentDir, filepath)
                .split(path.sep)
                .join('/');
            return { relativePath };
        },
    });
    const templateEntries = discover({
        dir: path.join(srcDir, 'templates'),
        pattern: '*.md',
        identity: (filepath) => path.basename(filepath, '.md'),
        metadata: (filepath) => ({
            relativePath: `templates/${path.basename(filepath)}`,
        }),
    });
    const referenceEntries = discover({
        dir: path.join(srcDir, 'references'),
        pattern: '*.md',
        identity: (filepath) => path.basename(filepath, '.md'),
        metadata: (filepath) => ({
            relativePath: `references/${path.basename(filepath)}`,
        }),
    });
    const resources = {};
    for (const entry of [...skillEntries, ...templateEntries, ...referenceEntries]) {
        resources[entry.id] = entry.relativePath;
    }
    return resources;
}
function buildHookRegistry(srcDir) {
    const hookEntries = discover({
        dir: path.join(srcDir, 'hooks', 'logic'),
        pattern: '*-logic.ts',
        identity: (filepath) => path.basename(filepath).replace(/-logic\.ts$/, ''),
        metadata: (filepath) => {
            const file = path.basename(filepath);
            const hookName = file.replace(/-logic\.ts$/, '');
            const runtimeFile = file.replace(/\.ts$/, '.js');
            return {
                module: `hooks/logic/${runtimeFile}`,
                fn: `handle${toPascalCase(hookName)}`,
            };
        },
    });
    const hooks = {};
    for (const entry of hookEntries) {
        hooks[entry.id] = { module: entry.module, fn: entry.fn };
    }
    return hooks;
}
function buildRegistries(srcDir) {
    const registries = [
        { fileName: 'agent-registry.json', data: buildAgentRegistry(srcDir) },
        { fileName: 'resource-registry.json', data: buildResourceRegistry(srcDir) },
        { fileName: 'hook-registry.json', data: buildHookRegistry(srcDir) },
    ];
    for (const { fileName, data } of registries) {
        validateRegistry(fileName, data);
    }
    return registries;
}
function collectRegistryOutputs(srcDir, rootDir = path.dirname(srcDir)) {
    const generatedDir = path.join(srcDir, 'generated');
    return buildRegistries(srcDir).map(({ fileName, data }) => ({
        outputPath: path.relative(rootDir, path.join(generatedDir, fileName)),
        content: serializeRegistry(data),
    }));
}
/**
 * Run all discovery scans and write the resulting JSON registry files to
 * src/generated/.
 * @param {string} srcDir - Absolute path to the src/ directory
 */
function generateRegistries(srcDir) {
    const generatedDir = path.join(srcDir, 'generated');
    fs.mkdirSync(generatedDir, { recursive: true });
    for (const { fileName, data } of buildRegistries(srcDir)) {
        generateRegistry(data, path.join(generatedDir, fileName));
    }
}
export { buildRegistries, collectRegistryOutputs, generateRegistries };
