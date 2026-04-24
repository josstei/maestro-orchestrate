'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatterOnly, splitAtBoundary } = require('../../lib/frontmatter');
const { replaceInContent } = require('../../lib/naming');
const { stripFeatureBlocks: stripFeatureBlocksCore } = require('../../core/feature-blocks');

const agentRegistry = require('../../generated/agent-registry.json');

const DEFAULT_RUNTIME_NAME = 'gemini';

const RESOURCE_ALLOWLIST = Object.freeze(require('../../generated/resource-registry.json'));

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

  return content.replace(
    /^(---\n[\s\S]*?)(^---)/m,
    '$1user-invocable: false\n$2'
  );
}

function applyReplaceAgentNames(content, runtimeConfig) {
  return replaceInContent(
    content,
    AGENT_ALLOWLIST.filter((n) => n.includes('-')),
    runtimeConfig.agentNaming
  );
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

function readResourceFromFilesystem(id, runtimeConfig, srcRoot) {
  const relativePath = RESOURCE_ALLOWLIST[id];
  if (!relativePath) {
    return {
      error: `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCE_ALLOWLIST).join(', ')}`,
    };
  }

  const absolutePath = path.join(srcRoot, relativePath);
  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    return {
      content: applyRuntimeTransforms(content, runtimeConfig, relativePath),
    };
  } catch (err) {
    return {
      error: `Failed to read resource "${id}": ${err.code || 'UNKNOWN'}`,
    };
  }
}

function readAgentFromFilesystem(agentName, runtimeConfig, srcRoot) {
  if (!AGENT_ALLOWLIST.includes(agentName)) {
    return {
      error: `Unknown agent identifier: "${agentName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`,
    };
  }

  const absolutePath = path.join(srcRoot, 'agents', `${agentName}.md`);
  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    const frontmatter = parseFrontmatter(content);
    return {
      agent: {
        body: stripFrontmatter(stripFeatureBlocks(content, runtimeConfig)),
        tools: mapTools(frontmatter, runtimeConfig),
      },
    };
  } catch (err) {
    return {
      error: `Failed to read agent "${agentName}": ${err.code || 'UNKNOWN'}`,
    };
  }
}

module.exports = {
  DEFAULT_RUNTIME_NAME,
  RESOURCE_ALLOWLIST,
  AGENT_ALLOWLIST,
  applyReplacePaths,
  applySkillMetadata,
  applyReplaceAgentNames,
  applyStripFeature,
  applyRuntimeTransforms,
  stripFrontmatter,
  stripFeatureBlocks,
  parseInlineArray,
  parseFrontmatter,
  mapTools,
  readResourceFromFilesystem,
  readAgentFromFilesystem,
};
