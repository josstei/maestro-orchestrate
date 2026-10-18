'use strict';

const { toSnakeCase } = require('../lib/naming');
const { parse, escapeYaml } = require('../lib/frontmatter');
const { emitBlockList } = require('../lib/yaml-emit');

/**
 * Per-field emitters, keyed by the names runtime configs list in
 * `agentFrontmatter.fields`. Each returns the YAML line(s) to append, or an
 * empty array to skip the field entirely.
 *
 * Context shape:
 *   - `name`         - agent name in the runtime's naming convention
 *   - `frontmatter`  - parsed input frontmatter
 *   - `description`  - final description (may have examples appended for claude)
 *   - `tools`        - resolved tool list (explicit `tools.<runtime>` override,
 *                      otherwise the canonical list mapped through
 *                      runtime.tools)
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

  turns: (ctx) =>
    ctx.fm.turnsField && ctx.frontmatter.max_turns != null
      ? [`${ctx.fm.turnsField}: ${ctx.frontmatter.max_turns}`]
      : [],
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
 * Collect the <example>...</example> blocks from body text.
 * @param {string} body - Body text to extract examples from
 * @returns {string[]} Each example block, tags included
 * @throws {Error} When an <example> tag is never closed
 */
function extractExamples(body) {
  const examples = [];
  let inExample = false;
  let currentExample = [];

  for (const line of body.split('\n')) {
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
    }
  }

  if (inExample) {
    throw new Error('Unclosed <example> tag in agent body');
  }

  return examples;
}

/**
 * Transform: agent-stub
 *
 * Builds an agent discovery stub: runtime-specific frontmatter (the fields
 * listed in `runtime.agentFrontmatter.fields`, in that order, with
 * `<example>` blocks from the body appended to the description when the
 * runtime enables `features.exampleBlocks`) followed by a body that points
 * at the MCP `get_agent` tool. The source methodology body is not emitted.
 *
 * @param {string} content  - Full agent file with --- delimited frontmatter
 * @param {object} runtime  - Runtime config (name, agentNaming, agentFrontmatter, tools, features)
 * @returns {string} Stub content
 */
function agentStub(content, runtime) {
  const { frontmatter, body } = parse(content);
  const examples = runtime.features?.exampleBlocks ? extractExamples(body) : [];
  const fm = runtime.agentFrontmatter;

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

  const lines = ['---'];
  for (const fieldName of fm.fields) {
    lines.push(...FIELDS[fieldName](ctx));
  }
  lines.push(
    '---',
    '',
    'Agent methodology loaded via MCP tool `get_agent`. ' +
      `Call \`get_agent(agents: ["${frontmatter.name || ''}"])\` to read the full methodology at delegation time.`,
    ''
  );

  return lines.join('\n');
}

module.exports = agentStub;
