'use strict';

const fs = require('fs');
const path = require('path');

const { DEFAULT_RUNTIME_CONFIG, DEFAULT_SRC_RELATIVE_PATH } = require('./get-skill-content');

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

function resolveExtensionRoot() {
  if (process.env.MAESTRO_EXTENSION_PATH) {
    return process.env.MAESTRO_EXTENSION_PATH;
  }
  const serverFile = process.argv[1];
  if (serverFile) {
    return path.resolve(path.dirname(serverFile), '..');
  }
  return process.cwd();
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
  const runtimeName = runtimeConfig.name || DEFAULT_RUNTIME_CONFIG.name;
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

function createHandler(
  runtimeConfig = DEFAULT_RUNTIME_CONFIG,
  srcRelativePath = DEFAULT_SRC_RELATIVE_PATH
) {
  return function handleGetAgent(params) {
    const requestedAgents = params.agents;
    if (!Array.isArray(requestedAgents) || requestedAgents.length === 0) {
      throw new Error('agents must be a non-empty array of kebab-case agent identifiers');
    }

    const extensionRoot = resolveExtensionRoot();
    const srcRoot = path.resolve(extensionRoot, srcRelativePath);
    const agents = {};
    const errors = {};

    for (const rawName of requestedAgents) {
      const agentName = String(rawName || '').trim();
      if (!AGENT_ALLOWLIST.includes(agentName)) {
        errors[agentName || '(empty)'] =
          `Unknown agent identifier: "${agentName}". Known identifiers: ${AGENT_ALLOWLIST.join(', ')}`;
        continue;
      }

      const absolutePath = path.join(srcRoot, 'agents', `${agentName}.md`);
      try {
        const content = fs.readFileSync(absolutePath, 'utf8');
        const frontmatter = parseFrontmatter(content);
        agents[agentName] = {
          body: stripFrontmatter(stripFeatureBlocks(content, runtimeConfig)),
          tools: mapTools(frontmatter, runtimeConfig),
        };
      } catch (err) {
        errors[agentName] = `Failed to read agent "${agentName}": ${err.code || 'UNKNOWN'}`;
      }
    }

    return { agents, errors };
  };
}

const handleGetAgent = createHandler();

module.exports = {
  AGENT_ALLOWLIST,
  createHandler,
  handleGetAgent,
};
