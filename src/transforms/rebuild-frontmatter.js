'use strict';

const { toSnakeCase } = require('../lib/naming');
const { escapeYaml } = require('../lib/frontmatter');

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
    if (ctx.runtime.name === 'claude' && ctx.description.includes('\n')) {
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

  tools: (ctx) => {
    if (!ctx.tools || ctx.tools.length === 0) return [];
    return ['tools:', ...ctx.tools.map((tool) => `  - ${tool}`)];
  },

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

  return (frontmatter.tools || [])
    .map((tool) => {
      const mapped = runtime.tools && runtime.tools[tool];
      if (Array.isArray(mapped)) return mapped;
      return mapped || tool;
    })
    .flat();
}

function buildDescription(baseDescription, examples, runtime) {
  if (runtime.name === 'claude' && examples.length > 0) {
    return baseDescription + '\n\n' + examples.join('\n');
  }
  return baseDescription;
}

/**
 * Transform: rebuild-frontmatter
 *
 * Reads parsed frontmatter, body, and optional examples from the shared
 * pipeline state and produces the final output content with runtime-specific
 * frontmatter formatting.
 *
 * @param {string} _content - Original content (unused; state drives output)
 * @param {object} runtime  - Runtime config (name, agentNaming, agentFrontmatter, tools)
 * @param {object} options  - Pipeline options with shared state
 * @returns {string} Final content with rebuilt frontmatter
 */
function rebuildFrontmatterTransform(_content, runtime, options) {
  const frontmatter = options.state.frontmatter || {};
  const body = options.state.body != null ? options.state.body : '';
  const examples = options.state.examples || [];
  const fm = runtime.agentFrontmatter || {};

  const name =
    runtime.agentNaming === 'snake_case'
      ? toSnakeCase(frontmatter.name)
      : frontmatter.name;

  const ctx = {
    name,
    frontmatter,
    description: buildDescription(frontmatter.description || '', examples, runtime),
    tools: resolveTools(frontmatter, runtime),
    runtime,
    fm,
  };

  const fieldOrder = RUNTIME_FIELD_ORDER[runtime.name] || DEFAULT_FIELD_ORDER;
  const lines = ['---'];
  for (const fieldName of fieldOrder) {
    const emit = FIELDS[fieldName];
    if (!emit) continue;
    lines.push(...emit(ctx));
  }
  lines.push('---');

  return lines.join('\n') + '\n' + body;
}

module.exports = rebuildFrontmatterTransform;
