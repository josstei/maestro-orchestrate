'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../../lib/frontmatter');
const { replaceInContent } = require('../../lib/naming');
const { stripFeatureBlocks } = require('../../core/feature-blocks');
const { mapTools } = require('../../core/agent-tools');
const { AGENT_NAMES } = require('../../core/agent-registry');

const RESOURCE_ALLOWLIST = Object.freeze(require('../../generated/resource-registry.json'));

const HYPHENATED_AGENT_NAMES = AGENT_NAMES.filter((name) => name.includes('-'));

/**
 * Rewrite `${extensionPath}` in served markdown to the runtime's extension-root
 * variable (runtimeConfig.env.extensionPath). No other placeholder is
 * substituted.
 */
function applyReplacePaths(content, runtimeConfig) {
  let result = content;
  const env = runtimeConfig.env || {};

  if (env.extensionPath) {
    result = result.replace(/\$\{extensionPath\}/g, '${' + env.extensionPath + '}');
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
 * Read an agent definition and serve its methodology body with the shared
 * Output Contract (agents/shared/handoff-report.md) appended.
 *
 * Callers must pass a name from AGENT_NAMES; get_agent enforces this
 * before reading.
 */
function readAgentFromFilesystem(agentName, runtimeConfig, srcRoot) {
  const agentsDir = path.join(srcRoot, 'agents');
  try {
    const content = fs.readFileSync(path.join(agentsDir, `${agentName}.md`), 'utf8');
    const outputContract = fs.readFileSync(
      path.join(agentsDir, 'shared', 'handoff-report.md'),
      'utf8'
    );
    // Strip feature blocks before splitting off the frontmatter, so blank-line
    // collapsing also applies across the frontmatter boundary.
    const { frontmatter, body } = parse(
      stripFeatureBlocks(content, runtimeConfig.features || {}, { mode: 'lenient' })
    );
    return {
      agent: {
        body: `${body}\n${outputContract}`,
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
  readResourceFromFilesystem,
  readAgentFromFilesystem,
};
