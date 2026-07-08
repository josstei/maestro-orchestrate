import fs from 'fs';
import path from 'path';
import { parseFrontmatterOnly, splitAtBoundary } from '../../lib/frontmatter/index.js';
import { replaceInContent } from '../../lib/naming/index.js';
import { stripFeatureBlocks as stripFeatureBlocksCore } from '../../core/feature-blocks.js';
import { readAgentSourceContent, renderAgentProfileSources } from '../../core/agent-sources.js';
import { renderRosterTable } from '../../core/roster-renderer.js';
import { readFileSync } from 'node:fs';

const agentRegistry = JSON.parse(
  readFileSync(new URL('../../generated/agent-registry.json', import.meta.url), 'utf8')
);

const DEFAULT_RUNTIME_NAME = 'gemini';

const resourceRegistryJson = JSON.parse(
  readFileSync(new URL('../../generated/resource-registry.json', import.meta.url), 'utf8')
);

const RUNTIME_CONTENT_REGISTRY = 'runtime-content-registry.json';
const DEFAULT_RUNTIME_CONTENT_PAYLOAD = 'runtime-content-registry.txt';
const RESOURCE_ALLOWLIST = Object.freeze(resourceRegistryJson);
const AGENT_ALLOWLIST = Object.freeze(agentRegistry.map((entry: any) => entry.name));

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
  if (!raw || !raw.startsWith('[') || !raw.endsWith(']')) {
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
function readAllowlistedFile(id: any, srcRoot: any, { unknownLabel, resolveRelativePath, knownIdsForError }: any) {
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

function readRawResourceFromFilesystem(id: any, srcRoot: any) {
  return readAllowlistedFile(id, srcRoot, {
    unknownLabel: 'resource',
    resolveRelativePath: (resourceId: any) => RESOURCE_ALLOWLIST[resourceId],
    knownIdsForError: Object.keys(RESOURCE_ALLOWLIST).join(', '),
  });
}

function runtimeContentRegistryPath(srcRoot: any) {
  return path.join(srcRoot, 'generated', RUNTIME_CONTENT_REGISTRY);
}

function hasRuntimeContentRegistry(srcRoot: any) {
  return fs.existsSync(runtimeContentRegistryPath(srcRoot));
}

function readRuntimeContentRegistry(srcRoot: any) {
  return JSON.parse(fs.readFileSync(runtimeContentRegistryPath(srcRoot), 'utf8'));
}

function readRegistryPayload(srcRoot: any, registry: any) {
  const payloadPath = registry.payload || DEFAULT_RUNTIME_CONTENT_PAYLOAD;
  return fs.readFileSync(path.join(srcRoot, 'generated', payloadPath), 'utf8');
}

function materializeRegistryEntry(entry: any, srcRoot: any, registry: any) {
  if (entry && typeof entry.content === 'string' && typeof entry.relativePath === 'string') {
    return {
      content: entry.content,
      path: path.join(srcRoot, entry.relativePath),
      relativePath: entry.relativePath,
    };
  }

  if (
    Array.isArray(entry) &&
    typeof entry[0] === 'string' &&
    typeof entry[1] === 'number' &&
    typeof entry[2] === 'number'
  ) {
    const payload = readRegistryPayload(srcRoot, registry);
    return {
      content: payload.slice(entry[1], entry[1] + entry[2]),
      path: path.join(srcRoot, entry[0]),
      relativePath: entry[0],
    };
  }

  return null;
}

function readRegistryEntry(id: any, srcRoot: any, { unknownLabel, entries, knownIdsForError }: any) {
  if (!entries.includes(id)) {
    return {
      error: `Unknown ${unknownLabel} identifier: "${id}". Known identifiers: ${knownIdsForError}`,
    };
  }

  const registryPath = runtimeContentRegistryPath(srcRoot);
  try {
    const registry = readRuntimeContentRegistry(srcRoot);
    const entry = registry[`${unknownLabel}s`] && registry[`${unknownLabel}s`][id];
    const materialized = materializeRegistryEntry(entry, srcRoot, registry);
    if (!materialized) {
      return {
        error: `Failed to read ${unknownLabel} "${id}": ENOENT`,
        code: 'ENOENT',
        path: registryPath,
      };
    }

    return materialized;
  } catch (err: any) {
    return {
      error: `Failed to read ${unknownLabel} "${id}": ${err.code || 'UNKNOWN'}`,
      code: err.code || 'UNKNOWN',
      path: registryPath,
    };
  }
}

function readRawResourceFromRegistry(id: any, srcRoot: any) {
  return readRegistryEntry(id, srcRoot, {
    unknownLabel: 'resource',
    entries: Object.keys(RESOURCE_ALLOWLIST),
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

function materializeResource(rawResource: any, runtimeConfig: any, srcRoot: any) {
  const transformed = applyRuntimeTransforms(
    rawResource.content,
    runtimeConfig,
    rawResource.relativePath
  );

  return {
    content: expandRosterMarker(transformed, runtimeConfig, srcRoot),
  };
}

function readAndMaterialize(raw: any, materializer: any) {
  return raw.error ? raw : materializer(raw);
}

function readResourceFromFilesystem(id: any, runtimeConfig: any, srcRoot: any) {
  const rawResource = readRawResourceFromFilesystem(id, srcRoot);
  return readAndMaterialize(rawResource, (raw: any) =>
    materializeResource(raw, runtimeConfig, srcRoot)
  );
}

function readResourceFromRegistry(id: any, runtimeConfig: any, srcRoot: any) {
  const rawResource = readRawResourceFromRegistry(id, srcRoot);
  return readAndMaterialize(rawResource, (raw: any) =>
    materializeResource(raw, runtimeConfig, srcRoot)
  );
}

function readRawAgentFromFilesystem(agentName: any, srcRoot: any) {
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

function readRawAgentFromRegistry(agentName: any, srcRoot: any) {
  if (!AGENT_ALLOWLIST.includes(agentName)) {
    return {
      error: `Unknown agent identifier: "${agentName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`,
    };
  }

  const registryPath = runtimeContentRegistryPath(srcRoot);
  try {
    const registry = readRuntimeContentRegistry(srcRoot);
    if (registry.agentProfiles) {
      const profiles = Object.entries(registry.agentProfiles)
        .map(([id, entry]: any) => {
          const materialized = materializeRegistryEntry(entry, srcRoot, registry);
          return materialized ? { profilePath: materialized.relativePath || id, content: materialized.content } : null;
        })
        .filter(Boolean);
      const source = renderAgentProfileSources(profiles as { profilePath: string; content: string }[])
        .find((entry) => entry.name === agentName);
      if (source) {
        return {
          content: source.content,
          path: path.join(srcRoot, source.relativePath),
          relativePath: source.relativePath,
        };
      }
    }
  } catch (err: any) {
    return {
      error: `Failed to read agent "${agentName}": ${err.code || 'UNKNOWN'}`,
      code: err.code || 'UNKNOWN',
      path: registryPath,
    };
  }

  return readRegistryEntry(agentName, srcRoot, {
    unknownLabel: 'agent',
    entries: AGENT_ALLOWLIST,
    knownIdsForError: AGENT_ALLOWLIST.join(', '),
  });
}

function materializeAgent(rawAgent: any, runtimeConfig: any) {
  const frontmatter = parseFrontmatter(rawAgent.content);
  return {
    agent: {
      body: stripFrontmatter(stripFeatureBlocks(rawAgent.content, runtimeConfig)),
      tools: mapTools(frontmatter, runtimeConfig),
    },
  };
}

function readAgentFromFilesystem(agentName: any, runtimeConfig: any, srcRoot: any) {
  const rawAgent = readRawAgentFromFilesystem(agentName, srcRoot);
  return readAndMaterialize(rawAgent, (raw: any) => materializeAgent(raw, runtimeConfig));
}

function readAgentFromRegistry(agentName: any, runtimeConfig: any, srcRoot: any) {
  const rawAgent = readRawAgentFromRegistry(agentName, srcRoot);
  return readAndMaterialize(rawAgent, (raw: any) => materializeAgent(raw, runtimeConfig));
}

function listBlueprintsFromRegistry(srcRoot: any) {
  const registry = readRuntimeContentRegistry(srcRoot);
  return Object.entries(registry.blueprints || {})
    .map(([id, entry]: any) => {
      const blueprint = materializeRegistryEntry(entry, srcRoot, registry);
      return blueprint ? { id, ...blueprint } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.id.localeCompare(b.id));
}

function readBlueprintFromRegistry(blueprintId: any, srcRoot: any) {
  const registry = readRuntimeContentRegistry(srcRoot);
  const entry = registry.blueprints && registry.blueprints[blueprintId];
  return materializeRegistryEntry(entry, srcRoot, registry);
}

export { DEFAULT_RUNTIME_NAME, RESOURCE_ALLOWLIST, AGENT_ALLOWLIST, applyReplacePaths, applySkillMetadata, applyReplaceAgentNames, applyStripFeature, applyRuntimeTransforms, loadAgentRegistryFromSrcRoot, expandRosterMarker, stripFrontmatter, stripFeatureBlocks, parseInlineArray, parseFrontmatter, mapTools, runtimeContentRegistryPath, hasRuntimeContentRegistry, readRuntimeContentRegistry, readRawResourceFromFilesystem, readRawResourceFromRegistry, materializeResource, readResourceFromFilesystem, readResourceFromRegistry, readRawAgentFromFilesystem, readRawAgentFromRegistry, materializeAgent, readAgentFromFilesystem, readAgentFromRegistry, listBlueprintsFromRegistry, readBlueprintFromRegistry };
