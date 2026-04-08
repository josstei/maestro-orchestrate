'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_RUNTIME_NAME = 'gemini';

const RESOURCE_ALLOWLIST = Object.freeze({
  'delegation':                 'skills/shared/delegation/SKILL.md',
  'execution':                  'skills/shared/execution/SKILL.md',
  'validation':                 'skills/shared/validation/SKILL.md',
  'session-management':         'skills/shared/session-management/SKILL.md',
  'implementation-planning':    'skills/shared/implementation-planning/SKILL.md',
  'code-review':                'skills/shared/code-review/SKILL.md',
  'design-dialogue':            'skills/shared/design-dialogue/SKILL.md',
  'agent-base-protocol':        'skills/shared/delegation/protocols/agent-base-protocol.md',
  'filesystem-safety-protocol': 'skills/shared/delegation/protocols/filesystem-safety-protocol.md',
  'design-document':            'templates/design-document.md',
  'implementation-plan':        'templates/implementation-plan.md',
  'session-state':              'templates/session-state.md',
  'architecture':               'references/architecture.md',
  'orchestration-steps':        'references/orchestration-steps.md',
});

const AGENT_ALLOWLIST = Object.freeze([
  'architect',
  'api-designer',
  'code-reviewer',
  'coder',
  'data-engineer',
  'debugger',
  'devops-engineer',
  'performance-engineer',
  'refactor',
  'security-engineer',
  'technical-writer',
  'tester',
  'seo-specialist',
  'copywriter',
  'content-strategist',
  'ux-designer',
  'accessibility-specialist',
  'product-manager',
  'analytics-engineer',
  'i18n-specialist',
  'design-system-engineer',
  'compliance-reviewer',
]);

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
  if (runtimeConfig.agentNaming !== 'snake_case') {
    return content;
  }

  return content
    .replace(/\bapi-designer\b/g, 'api_designer')
    .replace(/\bcode-reviewer\b/g, 'code_reviewer')
    .replace(/\bdata-engineer\b/g, 'data_engineer')
    .replace(/\bdevops-engineer\b/g, 'devops_engineer')
    .replace(/\bperformance-engineer\b/g, 'performance_engineer')
    .replace(/\bsecurity-engineer\b/g, 'security_engineer')
    .replace(/\btechnical-writer\b/g, 'technical_writer')
    .replace(/\bseo-specialist\b/g, 'seo_specialist')
    .replace(/\bcontent-strategist\b/g, 'content_strategist')
    .replace(/\bux-designer\b/g, 'ux_designer')
    .replace(/\baccessibility-specialist\b/g, 'accessibility_specialist')
    .replace(/\bproduct-manager\b/g, 'product_manager')
    .replace(/\banalytics-engineer\b/g, 'analytics_engineer')
    .replace(/\bi18n-specialist\b/g, 'i18n_specialist')
    .replace(/\bdesign-system-engineer\b/g, 'design_system_engineer')
    .replace(/\bcompliance-reviewer\b/g, 'compliance_reviewer');
}

function applyStripFeature(content, runtimeConfig) {
  const features = runtimeConfig.features || {};

  return content.replace(
    /^[ \t]*<!-- @feature (\S+) -->\n([\s\S]*?)^[ \t]*<!-- @end-feature -->\n?/gm,
    (_match, flagName, body) => {
      if (!(flagName in features)) {
        throw new Error(`Unknown feature flag: "${flagName}"`);
      }
      return features[flagName] ? body : '';
    }
  ).replace(/\n{3,}/g, '\n\n');
}

function applyRuntimeTransforms(content, runtimeConfig, resourcePath) {
  let result = content;

  if (resourcePath === 'references/architecture.md') {
    result = applyStripFeature(result, runtimeConfig);
    result = applyReplaceAgentNames(result, runtimeConfig);
  }

  result = applyReplacePaths(result, runtimeConfig);
  result = applySkillMetadata(result, runtimeConfig, resourcePath);

  return result;
}

function stripFrontmatter(content) {
  if (!content.startsWith('---\n')) {
    return content;
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return content;
  }

  return content.slice(end + 5);
}

function stripFeatureBlocks(content, runtimeConfig) {
  const features = runtimeConfig.features || {};

  return content.replace(
    /^[ \t]*<!-- @feature (\S+) -->\n([\s\S]*?)^[ \t]*<!-- @end-feature -->\n?/gm,
    (_match, flagName, body) => {
      if (!(flagName in features)) {
        return '';
      }
      return features[flagName] ? body : '';
    }
  ).replace(/\n{3,}/g, '\n\n');
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
  if (!content.startsWith('---\n')) {
    return {};
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return {};
  }

  const frontmatter = {};
  const lines = content.slice(4, end).split('\n');

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    frontmatter[key] = rawValue;
  }

  return frontmatter;
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
