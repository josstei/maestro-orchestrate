'use strict';

const fs = require('fs');
const path = require('path');

const { getRuntimeConfig, getDefaultRuntimeConfig } = require('../runtime/runtime-config-map');
const { resolveSrcRoot } = require('../utils/extension-root');

const DEFAULT_RUNTIME_CONFIG = getDefaultRuntimeConfig();

const DEFAULT_SRC_RELATIVE_PATH = 'src';

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

function createHandler(
  runtimeConfig = DEFAULT_RUNTIME_CONFIG,
  srcRelativePath = DEFAULT_SRC_RELATIVE_PATH
) {
  return function handleGetSkillContent(params) {
    const resources = params.resources;
    if (!Array.isArray(resources) || resources.length === 0) {
      throw new Error('resources must be a non-empty array of resource identifiers');
    }

    const srcRoot = resolveSrcRoot(srcRelativePath);
    const contents = {};
    const errors = {};

    for (const id of resources) {
      const relativePath = RESOURCE_ALLOWLIST[id];
      if (!relativePath) {
        errors[id] = `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCE_ALLOWLIST).join(', ')}`;
        continue;
      }

      const absolutePath = path.join(srcRoot, relativePath);
      try {
        const content = fs.readFileSync(absolutePath, 'utf8');
        contents[id] = applyRuntimeTransforms(content, runtimeConfig, relativePath);
      } catch (err) {
        errors[id] = `Failed to read resource "${id}": ${err.code || 'UNKNOWN'}`;
      }
    }

    return { contents, errors };
  };
}

const handleGetSkillContent = createHandler();

module.exports = {
  RESOURCE_ALLOWLIST,
  DEFAULT_RUNTIME_CONFIG,
  DEFAULT_SRC_RELATIVE_PATH,
  applyRuntimeTransforms,
  createHandler,
  handleGetSkillContent,
};
