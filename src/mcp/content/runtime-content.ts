import fs from 'fs';
import path from 'path';
import { parse, parseFrontmatterOnly, splitAtBoundary } from '../../lib/frontmatter/index.js';
import { replaceInContent } from '../../lib/naming/index.js';
import { stripFeatureBlocks as stripFeatureBlocksCore } from '../../core/feature-blocks.js';
import { readAgentSourceContent } from '../../core/agent-sources.js';
import { renderRosterTable } from '../../core/roster-renderer.js';
import {
  AGENT_ALLOWLIST,
  RESOURCE_ALLOWLIST,
  createRuntimeContentSnapshot,
  hasRuntimeContentRegistry,
  isKnownResource,
  readRuntimeContentRegistry,
  runtimeContentRegistryPath,
} from './runtime-content-snapshot.js';
import type { ContentReadError, RawContent } from './runtime-content-snapshot.js';

const DEFAULT_RUNTIME_NAME = 'gemini';

function applyReplacePaths(content: any, runtimeConfig: any) {
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

function applySkillMetadata(content: any, runtimeConfig: any, resourcePath: any) {
  if (runtimeConfig.name !== 'claude' || !resourcePath.endsWith('SKILL.md')) {
    return content;
  }

  return content.replace(
    /^(---\n[\s\S]*?)(^---)/m,
    '$1user-invocable: false\n$2'
  );
}

function applyReplaceAgentNames(content: any, runtimeConfig: any) {
  return replaceInContent(
    content,
    AGENT_ALLOWLIST.filter((n: any) => n.includes('-')),
    runtimeConfig.agentNaming
  );
}

function applyStripFeature(content: any, runtimeConfig: any) {
  return stripFeatureBlocksCore(content, runtimeConfig.features || {});
}

const AGENT_NAME_RESOURCES = new Set([
  'references/architecture.md',
  'skills/shared/delegation/SKILL.md',
  'skills/shared/execution/SKILL.md',
  'skills/shared/validation/SKILL.md',
  'skills/shared/code-review/SKILL.md',
]);

function applyRuntimeTransforms(content: any, runtimeConfig: any, resourcePath: any) {
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

function stripFrontmatter(content: any) {
  const { raw, body } = splitAtBoundary(content);
  if (!raw) {
    return content;
  }
  return body;
}

function stripFeatureBlocks(content: any, runtimeConfig: any) {
  return stripFeatureBlocksCore(content, runtimeConfig.features || {}, { mode: 'lenient' });
}

function parseInlineArray(raw: any) {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof raw !== 'string' || !raw.startsWith('[') || !raw.endsWith(']')) {
    return [];
  }

  return raw
    .slice(1, -1)
    .split(',')
    .map((item: any) => item.trim())
    .filter(Boolean);
}

function parseFrontmatter(content: any) {
  return parseFrontmatterOnly(content).frontmatter;
}

function mapTools(frontmatter: any, runtimeConfig: any) {
  const runtimeName = runtimeConfig.name || DEFAULT_RUNTIME_NAME;
  const overrideKey = `tools.${runtimeName}`;
  const configuredTools = frontmatter[overrideKey]
    ? parseInlineArray(frontmatter[overrideKey])
    : parseInlineArray(frontmatter.tools);

  return configuredTools.flatMap((toolName: any) => {
    const mapped = runtimeConfig.tools && runtimeConfig.tools[toolName];
    if (Array.isArray(mapped)) {
      return mapped;
    }
    return mapped || toolName;
  });
}

/** Shared allowlist-lookup -> path.join -> read/catch envelope. */
function readAllowlistedFile(
  id: any,
  srcRoot: any,
  { unknownLabel, resolveRelativePath, knownIdsForError }: any
): RawContent | ContentReadError {
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
  } catch (err: any) {
    return {
      error: `Failed to read ${unknownLabel} "${id}": ${err.code || 'UNKNOWN'}`,
      code: err.code || 'UNKNOWN',
      path: absolutePath,
    };
  }
}

function readRawResourceFromFilesystem(id: any, srcRoot: any): RawContent | ContentReadError {
  return readAllowlistedFile(id, srcRoot, {
    unknownLabel: 'resource',
    resolveRelativePath: (resourceId: any) =>
      isKnownResource(resourceId) ? RESOURCE_ALLOWLIST[resourceId] : undefined,
    knownIdsForError: Object.keys(RESOURCE_ALLOWLIST).join(', '),
  });
}

const ROSTER_MARKER = /<!-- @roster -->/g;

function loadAgentRegistryFromSrcRoot(srcRoot: any) {
  return JSON.parse(
    fs.readFileSync(path.join(srcRoot, 'generated', 'agent-registry.json'), 'utf8')
  );
}

function expandRosterMarker(content: any, runtimeConfig: any, srcRoot: any) {
  if (!content.includes('<!-- @roster -->')) {
    return content;
  }

  const agents = loadAgentRegistryFromSrcRoot(srcRoot);
  return content.replace(
    ROSTER_MARKER,
    renderRosterTable(agents, { agentNaming: runtimeConfig.agentNaming })
  );
}

function materializeResource(rawResource: RawContent, runtimeConfig: any, srcRoot: string) {
  const transformed = applyRuntimeTransforms(
    rawResource.content,
    runtimeConfig,
    rawResource.relativePath
  );

  return {
    content: expandRosterMarker(transformed, runtimeConfig, srcRoot),
  };
}

function readAndMaterialize<T>(
  raw: RawContent | ContentReadError,
  materializer: (content: RawContent) => T
): T | ContentReadError {
  return 'error' in raw ? raw : materializer(raw);
}

function readResourceFromFilesystem(id: any, runtimeConfig: any, srcRoot: any) {
  const rawResource = readRawResourceFromFilesystem(id, srcRoot);
  return readAndMaterialize(rawResource, (raw: any) =>
    materializeResource(raw, runtimeConfig, srcRoot)
  );
}

function readRawAgentFromFilesystem(agentName: any, srcRoot: any): RawContent | ContentReadError {
  if (!AGENT_ALLOWLIST.includes(agentName)) {
    return {
      error: `Unknown agent identifier: "${agentName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`,
    };
  }

  const relativePath = path.join('agents', `${agentName}.md`);
  const absolutePath = path.join(srcRoot, relativePath);
  try {
    return {
      content: readAgentSourceContent(srcRoot, relativePath),
      path: absolutePath,
      relativePath,
    };
  } catch (err: any) {
    return {
      error: `Failed to read agent "${agentName}": ${err.code || 'UNKNOWN'}`,
      code: err.code || 'UNKNOWN',
      path: absolutePath,
    };
  }
}

function materializeAgent(rawAgent: RawContent, runtimeConfig: any) {
  const { frontmatter, body } = parse(rawAgent.content);
  return {
    agent: {
      body: stripFeatureBlocks(body, runtimeConfig),
      tools: mapTools(frontmatter, runtimeConfig),
    },
  };
}

function readAgentFromFilesystem(agentName: any, runtimeConfig: any, srcRoot: any) {
  const rawAgent = readRawAgentFromFilesystem(agentName, srcRoot);
  return readAndMaterialize(rawAgent, (raw: any) => materializeAgent(raw, runtimeConfig));
}

function readRawResourceFromRegistry(id: any, srcRoot: any): RawContent | ContentReadError {
  return { ...createRuntimeContentSnapshot(srcRoot).readResource(id) };
}

function readResourceFromRegistry(id: any, runtimeConfig: any, srcRoot: any) {
  return readAndMaterialize(readRawResourceFromRegistry(id, srcRoot), (raw) =>
    materializeResource(raw, runtimeConfig, srcRoot)
  );
}

function readRawAgentFromRegistry(agentName: any, srcRoot: any): RawContent | ContentReadError {
  return { ...createRuntimeContentSnapshot(srcRoot).readAgent(agentName) };
}

function readAgentFromRegistry(agentName: any, runtimeConfig: any, srcRoot: any) {
  return readAndMaterialize(readRawAgentFromRegistry(agentName, srcRoot), (raw) =>
    materializeAgent(raw, runtimeConfig)
  );
}

function listBlueprintsFromRegistry(srcRoot: any) {
  return createRuntimeContentSnapshot(srcRoot).listBlueprints()
    .map((blueprint) => ({ ...blueprint }));
}

function readBlueprintFromRegistry(blueprintId: any, srcRoot: any) {
  const blueprint = createRuntimeContentSnapshot(srcRoot).readBlueprint(blueprintId);
  return blueprint ? { ...blueprint } : null;
}

export { DEFAULT_RUNTIME_NAME, RESOURCE_ALLOWLIST, AGENT_ALLOWLIST, isKnownResource, applyReplacePaths, applySkillMetadata, applyReplaceAgentNames, applyStripFeature, applyRuntimeTransforms, loadAgentRegistryFromSrcRoot, expandRosterMarker, stripFrontmatter, stripFeatureBlocks, parseInlineArray, parseFrontmatter, mapTools, runtimeContentRegistryPath, hasRuntimeContentRegistry, readRuntimeContentRegistry, readRawResourceFromFilesystem, readRawResourceFromRegistry, materializeResource, readResourceFromFilesystem, readResourceFromRegistry, readRawAgentFromFilesystem, readRawAgentFromRegistry, materializeAgent, readAgentFromFilesystem, readAgentFromRegistry, listBlueprintsFromRegistry, readBlueprintFromRegistry };
