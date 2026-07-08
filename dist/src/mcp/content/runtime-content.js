import fs from 'fs';
import path from 'path';
import { parseFrontmatterOnly, splitAtBoundary } from '../../lib/frontmatter/index.js';
import { replaceInContent } from '../../lib/naming/index.js';
import { stripFeatureBlocks as stripFeatureBlocksCore } from '../../core/feature-blocks.js';
import { renderRosterTable } from '../../core/roster-renderer.js';
import { readFileSync } from 'node:fs';
const agentRegistry = JSON.parse(readFileSync(new URL('../../generated/agent-registry.json', import.meta.url), 'utf8'));
const DEFAULT_RUNTIME_NAME = 'gemini';
const resourceRegistryJson = JSON.parse(readFileSync(new URL('../../generated/resource-registry.json', import.meta.url), 'utf8'));
const RESOURCE_ALLOWLIST = Object.freeze(resourceRegistryJson);
const AGENT_ALLOWLIST = Object.freeze(agentRegistry.map((entry) => entry.name));
function applyReplacePaths(content, runtimeConfig) {
    let result = content;
    const env = runtimeConfig.env || {};
    if (env.extensionPath) {
        const replacement = env.extensionPath.startsWith('${')
            ? env.extensionPath
            : '${' + env.extensionPath + '}';
        result = result.replace(/\$\{extensionPath\}/g, replacement);
    }
    if (env.workspacePath) {
        result = result.replace(/\$\{workspacePath\}/g, '${' + env.workspacePath + '}');
    }
    return result;
}
function applySkillMetadata(content, runtimeConfig, resourcePath) {
    if (runtimeConfig.name !== 'claude' || !resourcePath.endsWith('SKILL.md')) {
        return content;
    }
    return content.replace(/^(---\n[\s\S]*?)(^---)/m, '$1user-invocable: false\n$2');
}
function applyReplaceAgentNames(content, runtimeConfig) {
    return replaceInContent(content, AGENT_ALLOWLIST.filter((n) => n.includes('-')), runtimeConfig.agentNaming);
}
function applyStripFeature(content, runtimeConfig) {
    return stripFeatureBlocksCore(content, runtimeConfig.features || {});
}
const AGENT_NAME_RESOURCES = new Set([
    'references/architecture.md',
    'skills/shared/delegation/SKILL.md',
    'skills/shared/execution/SKILL.md',
    'skills/shared/validation/SKILL.md',
    'skills/shared/code-review/SKILL.md',
]);
function applyRuntimeTransforms(content, runtimeConfig, resourcePath) {
    let result = content;
    if (resourcePath === 'references/architecture.md') {
        result = applyStripFeature(result, runtimeConfig);
    }
    if (AGENT_NAME_RESOURCES.has(resourcePath)) {
        result = applyReplaceAgentNames(result, runtimeConfig);
    }
    result = applyReplacePaths(result, runtimeConfig);
    result = applySkillMetadata(result, runtimeConfig, resourcePath);
    return result;
}
function stripFrontmatter(content) {
    const { raw, body } = splitAtBoundary(content);
    if (!raw) {
        return content;
    }
    return body;
}
function stripFeatureBlocks(content, runtimeConfig) {
    return stripFeatureBlocksCore(content, runtimeConfig.features || {}, { mode: 'lenient' });
}
function parseInlineArray(raw) {
    if (!raw || !raw.startsWith('[') || !raw.endsWith(']')) {
        return [];
    }
    return raw
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}
function parseFrontmatter(content) {
    return parseFrontmatterOnly(content).frontmatter;
}
function mapTools(frontmatter, runtimeConfig) {
    const runtimeName = runtimeConfig.name || DEFAULT_RUNTIME_NAME;
    const overrideKey = `tools.${runtimeName}`;
    const configuredTools = frontmatter[overrideKey]
        ? parseInlineArray(frontmatter[overrideKey])
        : parseInlineArray(frontmatter.tools);
    return configuredTools.flatMap((toolName) => {
        const mapped = runtimeConfig.tools && runtimeConfig.tools[toolName];
        if (Array.isArray(mapped)) {
            return mapped;
        }
        return mapped || toolName;
    });
}
/** Shared allowlist-lookup -> path.join -> read/catch envelope. */
function readAllowlistedFile(id, srcRoot, { unknownLabel, resolveRelativePath, knownIdsForError }) {
    const relativePath = resolveRelativePath(id);
    if (!relativePath) {
        return {
            error: `Unknown ${unknownLabel} identifier: "${id}". Known identifiers: ${knownIdsForError}`,
        };
    }
    const absolutePath = path.join(srcRoot, relativePath);
    try {
        const content = fs.readFileSync(absolutePath, 'utf8');
        return {
            content,
            path: absolutePath,
            relativePath,
        };
    }
    catch (err) {
        return {
            error: `Failed to read ${unknownLabel} "${id}": ${err.code || 'UNKNOWN'}`,
            code: err.code || 'UNKNOWN',
            path: absolutePath,
        };
    }
}
function readRawResourceFromFilesystem(id, srcRoot) {
    return readAllowlistedFile(id, srcRoot, {
        unknownLabel: 'resource',
        resolveRelativePath: (resourceId) => RESOURCE_ALLOWLIST[resourceId],
        knownIdsForError: Object.keys(RESOURCE_ALLOWLIST).join(', '),
    });
}
const ROSTER_MARKER = /<!-- @roster -->/g;
function loadAgentRegistryFromSrcRoot(srcRoot) {
    return JSON.parse(fs.readFileSync(path.join(srcRoot, 'generated', 'agent-registry.json'), 'utf8'));
}
function expandRosterMarker(content, runtimeConfig, srcRoot) {
    if (!content.includes('<!-- @roster -->')) {
        return content;
    }
    const agents = loadAgentRegistryFromSrcRoot(srcRoot);
    return content.replace(ROSTER_MARKER, renderRosterTable(agents, { agentNaming: runtimeConfig.agentNaming }));
}
function materializeResource(rawResource, runtimeConfig, srcRoot) {
    const transformed = applyRuntimeTransforms(rawResource.content, runtimeConfig, rawResource.relativePath);
    return {
        content: expandRosterMarker(transformed, runtimeConfig, srcRoot),
    };
}
function readAndMaterialize(raw, materializer) {
    return raw.error ? raw : materializer(raw);
}
function readResourceFromFilesystem(id, runtimeConfig, srcRoot) {
    const rawResource = readRawResourceFromFilesystem(id, srcRoot);
    return readAndMaterialize(rawResource, (raw) => materializeResource(raw, runtimeConfig, srcRoot));
}
function readRawAgentFromFilesystem(agentName, srcRoot) {
    return readAllowlistedFile(agentName, srcRoot, {
        unknownLabel: 'agent',
        resolveRelativePath: (name) => AGENT_ALLOWLIST.includes(name) ? path.join('agents', `${name}.md`) : null,
        knownIdsForError: AGENT_ALLOWLIST.join(', '),
    });
}
function materializeAgent(rawAgent, runtimeConfig) {
    const frontmatter = parseFrontmatter(rawAgent.content);
    return {
        agent: {
            body: stripFrontmatter(stripFeatureBlocks(rawAgent.content, runtimeConfig)),
            tools: mapTools(frontmatter, runtimeConfig),
        },
    };
}
function readAgentFromFilesystem(agentName, runtimeConfig, srcRoot) {
    const rawAgent = readRawAgentFromFilesystem(agentName, srcRoot);
    return readAndMaterialize(rawAgent, (raw) => materializeAgent(raw, runtimeConfig));
}
export { DEFAULT_RUNTIME_NAME, RESOURCE_ALLOWLIST, AGENT_ALLOWLIST, applyReplacePaths, applySkillMetadata, applyReplaceAgentNames, applyStripFeature, applyRuntimeTransforms, loadAgentRegistryFromSrcRoot, expandRosterMarker, stripFrontmatter, stripFeatureBlocks, parseInlineArray, parseFrontmatter, mapTools, readRawResourceFromFilesystem, materializeResource, readResourceFromFilesystem, readRawAgentFromFilesystem, materializeAgent, readAgentFromFilesystem };
