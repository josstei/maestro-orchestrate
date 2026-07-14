import fs from 'fs';
import path from 'path';
import { parse, parseFrontmatterOnly, splitAtBoundary } from '../../lib/frontmatter/index.js';
import { replaceInContent } from '../../lib/naming/index.js';
import { stripFeatureBlocks as stripFeatureBlocksCore } from '../../core/feature-blocks.js';
import { renderRosterTable } from '../../core/roster-renderer.js';
import {
  AGENT_ALLOWLIST,
  RESOURCE_ALLOWLIST,
  isKnownResource,
} from './runtime-content-snapshot.js';
import type { RawContent } from './runtime-content-snapshot.js';

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

function materializeAgent(rawAgent: RawContent, runtimeConfig: any) {
  const { frontmatter, body } = parse(rawAgent.content);
  return {
    agent: {
      body: stripFeatureBlocks(body, runtimeConfig),
      tools: mapTools(frontmatter, runtimeConfig),
    },
  };
}

export { DEFAULT_RUNTIME_NAME, RESOURCE_ALLOWLIST, AGENT_ALLOWLIST, isKnownResource, applyReplacePaths, applySkillMetadata, applyReplaceAgentNames, applyStripFeature, applyRuntimeTransforms, loadAgentRegistryFromSrcRoot, expandRosterMarker, stripFrontmatter, stripFeatureBlocks, parseInlineArray, parseFrontmatter, mapTools, materializeResource, materializeAgent };
