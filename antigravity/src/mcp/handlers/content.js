'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { mapTools } = require('../../core/agent-tools');
const { AGENT_NAMES } = require('../../core/agent-registry');
const { ValidationError } = require('../../lib/errors');
const { parse } = require('../../lib/frontmatter');
const { replaceInContent, toKebabCase, toNamingConvention } = require('../../lib/naming');
const RESOURCES = require('../../generated/resource-registry.json');

// Content is served from the src/ tree this module is loaded from, the same
// tree the resource registry and AGENT_NAMES come from.
const SRC_ROOT = path.join(__dirname, '..', '..');
const AGENTS_DIR = path.join(SRC_ROOT, 'agents');

const HYPHENATED_AGENT_NAMES = AGENT_NAMES.filter((name) => name.includes('-'));

// Resources whose agent names are rewritten to the runtime's agentNaming.
const AGENT_NAME_RESOURCES = new Set([
  'references/architecture.md',
  'skills/shared/delegation/SKILL.md',
  'skills/shared/execution/SKILL.md',
  'skills/shared/validation/SKILL.md',
  'skills/shared/code-review/SKILL.md',
]);

const FEATURE_BLOCK_REGEX =
  /^[ \t]*<!-- @feature (\S+) -->\n([\s\S]*?)^[ \t]*<!-- @end-feature -->\n?/gm;

/**
 * Keep the body of each `<!-- @feature <flag> -->` block whose flag is on in
 * `features`, drop the other blocks, then collapse runs of blank lines.
 *
 * @throws {Error} when a block names a flag `features` does not define
 */
function stripFeatureBlocks(content, features) {
  return content
    .replace(FEATURE_BLOCK_REGEX, (_match, flag, body) => {
      if (!(flag in features)) {
        throw new Error(`Unknown feature flag: "${flag}"`);
      }
      return features[flag] ? body : '';
    })
    .replace(/\n{3,}/g, '\n\n');
}

/** Read a resource and apply the runtime's transforms, in this order. */
function renderResource(relativePath, runtimeConfig) {
  let content = fs.readFileSync(path.join(SRC_ROOT, relativePath), 'utf8');

  if (relativePath === 'references/architecture.md') {
    content = stripFeatureBlocks(content, runtimeConfig.features);
  }

  if (AGENT_NAME_RESOURCES.has(relativePath)) {
    content = replaceInContent(content, HYPHENATED_AGENT_NAMES, runtimeConfig.agentNaming);
  }

  // `${extensionPath}` is the only placeholder served content uses.
  content = content.replace(/\$\{extensionPath\}/g, '${' + runtimeConfig.env.extensionPath + '}');

  if (runtimeConfig.name === 'claude' && relativePath.endsWith('SKILL.md')) {
    content = content.replace(/^(---\n[\s\S]*?)(^---)/m, '$1user-invocable: false\n$2');
  }

  return content;
}

/**
 * Read an agent and serve its methodology body, with the shared Output
 * Contract (agents/shared/handoff-report.md) appended, and its tools mapped
 * to the runtime.
 */
function renderAgent(name, runtimeConfig) {
  const content = fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8');
  const outputContract = fs.readFileSync(path.join(AGENTS_DIR, 'shared', 'handoff-report.md'), 'utf8');
  // Strip feature blocks before splitting off the frontmatter, so blank-line
  // collapsing also applies across the frontmatter boundary.
  const { frontmatter, body } = parse(stripFeatureBlocks(content, runtimeConfig.features));

  return {
    body: `${body}\n${outputContract}`,
    tools: mapTools(frontmatter, runtimeConfig),
    tool_name: toNamingConvention(name, runtimeConfig.agentNaming),
  };
}

function requireIdList(ids, message) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new ValidationError(message);
  }
}

/**
 * get_skill_content: serve each requested resource, keyed by the requested id.
 * An unknown id or an unreadable file is reported per id under `errors`.
 */
function handleGetSkillContent(params, _projectRoot, { runtimeConfig }) {
  requireIdList(params.resources, 'resources must be a non-empty array of resource identifiers');

  const contents = [];
  const errors = [];

  for (const id of params.resources) {
    if (!Object.hasOwn(RESOURCES, id)) {
      errors.push([id, `Unknown resource identifier: "${id}". Known identifiers: ${Object.keys(RESOURCES).join(', ')}`]);
      continue;
    }

    try {
      contents.push([id, renderResource(RESOURCES[id], runtimeConfig)]);
    } catch (err) {
      errors.push([id, `Failed to read resource "${id}": ${err.code || 'UNKNOWN'}`]);
    }
  }

  // Object.fromEntries makes every id an own key, so an id such as
  // '__proto__' is reported instead of hitting the prototype setter.
  return { contents: Object.fromEntries(contents), errors: Object.fromEntries(errors) };
}

/**
 * get_agent: serve each requested agent (kebab-case or snake_case), keyed by
 * the trimmed requested name. An unknown name or an unreadable file is
 * reported per name under `errors`.
 */
function handleGetAgent(params, _projectRoot, { runtimeConfig }) {
  requireIdList(params.agents, 'agents must be a non-empty array of agent identifiers');

  const agents = [];
  const errors = [];

  for (const rawName of params.agents) {
    const inputName = String(rawName || '').trim();
    const name = toKebabCase(inputName);

    if (!AGENT_NAMES.includes(name)) {
      errors.push([
        inputName || '(empty)',
        `Unknown agent identifier: "${inputName}". Known identifiers: ${AGENT_NAMES.join(', ')}`,
      ]);
      continue;
    }

    try {
      agents.push([inputName, renderAgent(name, runtimeConfig)]);
    } catch (err) {
      errors.push([inputName, `Failed to read agent "${name}": ${err.code || 'UNKNOWN'}`]);
    }
  }

  return { agents: Object.fromEntries(agents), errors: Object.fromEntries(errors) };
}

module.exports = {
  handleGetAgent,
  handleGetSkillContent,
};
