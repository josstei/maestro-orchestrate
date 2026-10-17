'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('../../lib/frontmatter');
const { replaceInContent } = require('../../lib/naming');
const { stripFeatureBlocks } = require('../../core/feature-blocks');
const { AGENT_NAMES } = require('../../core/agent-registry');

const RESOURCE_ALLOWLIST = Object.freeze(require('../../generated/resource-registry.json'));

const AGENT_ALLOWLIST = AGENT_NAMES;

const HYPHENATED_AGENT_NAMES = AGENT_ALLOWLIST.filter((name) => name.includes('-'));

function applyReplacePaths(content, runtimeConfig) {
  let result = content;
  const env = runtimeConfig.env || {};

  if (env.extensionPath) {
    result = result.replace(/\$\{extensionPath\}/g, '${' + env.extensionPath + '}');
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
    result = stripFeatureBlocks(result, runtimeConfig.features || {});
  }

  if (AGENT_NAME_RESOURCES.has(resourcePath)) {
    result = replaceInContent(result, HYPHENATED_AGENT_NAMES, runtimeConfig.agentNaming);
  }

  result = applyReplacePaths(result, runtimeConfig);
  result = applySkillMetadata(result, runtimeConfig, resourcePath);

  return result;
}

/**
 * Resolve an agent's declared tools for a runtime: the `tools.<runtime>`
 * override when present, else `tools`, each name mapped (and flattened)
 * through runtimeConfig.tools. Unmapped names pass through unchanged.
 */
function mapTools(frontmatter, runtimeConfig) {
  const declared = frontmatter[`tools.${runtimeConfig.name}`] || frontmatter.tools;

  return (Array.isArray(declared) ? declared : [])
    .filter(Boolean)
    .flatMap((toolName) => (runtimeConfig.tools && runtimeConfig.tools[toolName]) || toolName);
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

/**
 * Callers must pass a name from AGENT_ALLOWLIST; get_agent enforces this
 * before reading.
 */
function readAgentFromFilesystem(agentName, runtimeConfig, srcRoot) {
  const absolutePath = path.join(srcRoot, 'agents', `${agentName}.md`);
  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    // Strip feature blocks before splitting off the frontmatter, so blank-line
    // collapsing also applies across the frontmatter boundary.
    const { frontmatter, body } = parse(
      stripFeatureBlocks(content, runtimeConfig.features || {}, { mode: 'lenient' })
    );
    return {
      agent: {
        body,
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
  RESOURCE_ALLOWLIST,
  AGENT_ALLOWLIST,
  applyReplacePaths,
  applySkillMetadata,
  mapTools,
  readResourceFromFilesystem,
  readAgentFromFilesystem,
};
