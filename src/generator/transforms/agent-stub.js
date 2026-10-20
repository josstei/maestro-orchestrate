'use strict';

const { toNamingConvention } = require('../../lib/naming');
const { parse, escapeYaml } = require('../../lib/frontmatter');
const { mapTools } = require('../../core/agent-tools');

/**
 * Emitters for the `agentFrontmatter.fields` entries that depend on the
 * agent. Each returns the YAML line(s) to append, or an empty array to skip
 * the field entirely. Every other listed field (kind, subagent, mainAgent,
 * model) is a constant the runtime sets in `agentFrontmatter` and is emitted
 * as `<field>: <value>`.
 *
 * Context shape:
 *   - `name`          - agent name in the runtime's naming convention
 *   - `frontmatter`   - parsed input frontmatter
 *   - `description`   - final description (with the body's <example> blocks
 *                       appended when exampleBlocks is on)
 *   - `tools`         - resolved tool list (see mapTools)
 *   - `exampleBlocks` - the runtime's features.exampleBlocks
 *   - `fm`            - runtime.agentFrontmatter config
 */
const FIELDS = {
  name: (ctx) =>
    ctx.name != null && ctx.name !== '' ? [`name: ${ctx.name}`] : [],

  description: (ctx) => {
    if (ctx.exampleBlocks && ctx.description.includes('\n')) {
      return [
        'description: |',
        ...ctx.description.split('\n').map((line) => `  ${line}`),
      ];
    }
    return [`description: "${escapeYaml(ctx.frontmatter.description || '')}"`];
  },

  color: (ctx) =>
    ctx.frontmatter.color ? [`color: ${ctx.frontmatter.color}`] : [],

  tools: (ctx) =>
    ctx.tools.length > 0 ? ['tools:', ...ctx.tools.map((tool) => `  - ${tool}`)] : [],

  turns: (ctx) =>
    ctx.fm.turnsField && ctx.frontmatter.max_turns != null
      ? [`${ctx.fm.turnsField}: ${ctx.frontmatter.max_turns}`]
      : [],
};

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
  const exampleBlocks = runtime.features.exampleBlocks;
  const examples = exampleBlocks ? extractExamples(body) : [];
  const baseDescription = frontmatter.description || '';
  const fm = runtime.agentFrontmatter;

  const ctx = {
    name: toNamingConvention(frontmatter.name, runtime.agentNaming),
    frontmatter,
    description: examples.length > 0 ? `${baseDescription}\n\n${examples.join('\n')}` : baseDescription,
    tools: mapTools(frontmatter, runtime),
    exampleBlocks,
    fm,
  };

  const lines = ['---'];
  for (const field of fm.fields) {
    lines.push(...(FIELDS[field] ? FIELDS[field](ctx) : [`${field}: ${fm[field]}`]));
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
