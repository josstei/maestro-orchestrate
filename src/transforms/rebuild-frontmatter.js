'use strict';

const { toSnakeCase } = require('../lib/naming');
const { parse, escapeYaml } = require('../lib/frontmatter');
const { emitBlockList } = require('../lib/yaml-emit');

/**
 * Per-field emitters. Each returns the YAML line(s) to append, or an
 * empty array to skip the field entirely.
 *
 * Context shape:
 *   - `name`         - canonical agent name (snake_case or kebab-case)
 *   - `frontmatter`  - parsed input frontmatter
 *   - `description`  - final description (may have examples appended for claude)
 *   - `tools`        - flattened tool list (after per-runtime mapping)
 *   - `runtime`      - full runtime config
 *   - `fm`           - runtime.agentFrontmatter config (shape hints)
 */
const FIELDS = {
  name: (ctx) =>
    ctx.name != null && ctx.name !== '' ? [`name: ${ctx.name}`] : [],

  kind: (ctx) => (ctx.fm.kind ? [`kind: ${ctx.fm.kind}`] : []),

  description: (ctx) => {
    if (ctx.runtime.features?.exampleBlocks && ctx.description.includes('\n')) {
      return [
        'description: |',
        ...ctx.description.split('\n').map((line) => `  ${line}`),
      ];
    }
    return [`description: "${escapeYaml(ctx.frontmatter.description || '')}"`];
  },

  model: (ctx) => (ctx.fm.model ? [`model: ${ctx.fm.model}`] : []),

  color: (ctx) =>
    ctx.frontmatter.color ? [`color: ${ctx.frontmatter.color}`] : [],

  tools: (ctx) => emitBlockList('tools', ctx.tools),

  temperature: (ctx) =>
    ctx.fm.hasTemperature && ctx.frontmatter.temperature != null
      ? [`temperature: ${ctx.frontmatter.temperature}`]
      : [],

  turns: (ctx) =>
    ctx.fm.turnsField && ctx.frontmatter.max_turns != null
      ? [`${ctx.fm.turnsField}: ${ctx.frontmatter.max_turns}`]
      : [],

  timeout: (ctx) =>
    ctx.fm.hasTimeout && ctx.frontmatter.timeout_mins != null
      ? [`timeout_mins: ${ctx.frontmatter.timeout_mins}`]
      : [],
};

const DEFAULT_FIELD_ORDER = [
  'name',
  'kind',
  'description',
  'model',
  'turns',
  'tools',
];

const RUNTIME_FIELD_ORDER = {
  claude: ['name', 'kind', 'description', 'model', 'color', 'turns', 'tools'],
  gemini: [
    'name',
    'kind',
    'description',
    'model',
    'tools',
    'temperature',
    'turns',
    'timeout',
  ],
};

function resolveTools(frontmatter, runtime) {
  const overrideKey = `tools.${runtime.name}`;
  if (frontmatter[overrideKey]) {
    return frontmatter[overrideKey];
  }

  return (frontmatter.tools || []).flatMap(
    (tool) => (runtime.tools && runtime.tools[tool]) || tool
  );
}

function buildDescription(baseDescription, examples) {
  if (examples.length > 0) {
    return baseDescription + '\n\n' + examples.join('\n');
  }
  return baseDescription;
}

/**
 * Extract <example>...</example> blocks from body text.
 * @param {string} body - Body text to extract examples from
 * @returns {{ examples: string[], remaining: string }}
 */
function extractExamples(body) {
  const examples = [];
  const lines = body.split('\n');
  const remainingLines = [];
  let inExample = false;
  let currentExample = [];

  for (const line of lines) {
    if (line.trim() === '<example>') {
      inExample = true;
      currentExample = ['<example>'];
    } else if (line.trim() === '</example>') {
      inExample = false;
      currentExample.push('</example>');
      examples.push(currentExample.join('\n'));
      currentExample = [];
    } else if (inExample) {
      currentExample.push(line);
    } else {
      remainingLines.push(line);
    }
  }

  if (inExample) {
    throw new Error('Unclosed <example> tag in agent body');
  }

  let remaining = remainingLines.join('\n');
  remaining = remaining.replace(/\n{3,}/g, '\n\n');
  remaining = remaining.replace(/^\n{2,}/, '\n');

  return { examples, remaining };
}

/**
 * Transform: rebuild-frontmatter
 *
 * Parses the agent's YAML frontmatter, extracts `<example>` blocks from the
 * body (Claude only; they are appended to the description), and produces the
 * final output content with runtime-specific frontmatter formatting.
 *
 * @param {string} content  - Full agent file with --- delimited frontmatter
 * @param {object} runtime  - Runtime config (name, agentNaming, agentFrontmatter, tools)
 * @returns {string} Final content with rebuilt frontmatter
 */
function rebuildFrontmatterTransform(content, runtime) {
  const { frontmatter, body: sourceBody } = parse(content);
  const { examples, remaining: body } =
    runtime.features?.exampleBlocks
      ? extractExamples(sourceBody)
      : { examples: [], remaining: sourceBody };
  const fm = runtime.agentFrontmatter || {};

  const name =
    runtime.agentNaming === 'snake_case'
      ? toSnakeCase(frontmatter.name)
      : frontmatter.name;

  const ctx = {
    name,
    frontmatter,
    description: buildDescription(frontmatter.description || '', examples),
    tools: resolveTools(frontmatter, runtime),
    runtime,
    fm,
  };

  const fieldOrder = RUNTIME_FIELD_ORDER[runtime.name] || DEFAULT_FIELD_ORDER;
  const lines = ['---'];
  for (const fieldName of fieldOrder) {
    lines.push(...FIELDS[fieldName](ctx));
  }
  lines.push('---');

  return lines.join('\n') + '\n' + body;
}

module.exports = rebuildFrontmatterTransform;
