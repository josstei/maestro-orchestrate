'use strict';

const { toNamingConvention } = require('../lib/naming');
const { parse } = require('../lib/frontmatter');
const { emitBlockList, escapeYaml } = require('../lib/yaml-emit');
const { mapTools } = require('../core/agent-tools');

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
 * The name, description, color, tools and turns fields are computed from
 * the agent; any other listed field emits its `agentFrontmatter` value.
 *
 * @param {string} content  - Full agent file with --- delimited frontmatter
 * @param {object} runtime  - Runtime config (name, agentNaming, agentFrontmatter, tools, features)
 * @returns {string} Stub content
 * @throws {Error} When a listed field is neither computed nor set in `agentFrontmatter`
 */
function agentStub(content, runtime) {
  const { frontmatter, body } = parse(content);
  const examples = runtime.features?.exampleBlocks ? extractExamples(body) : [];
  const fm = runtime.agentFrontmatter;

  const name = toNamingConvention(frontmatter.name, runtime.agentNaming);
  const baseDescription = frontmatter.description || '';
  const description = examples.length ? baseDescription + '\n\n' + examples.join('\n') : baseDescription;
  const computed = {
    name: name != null && name !== '' ? [`name: ${name}`] : [],
    description: runtime.features?.exampleBlocks && description.includes('\n')
      ? ['description: |', ...description.split('\n').map((line) => `  ${line}`)]
      : [`description: "${escapeYaml(frontmatter.description || '')}"`],
    color: frontmatter.color ? [`color: ${frontmatter.color}`] : [],
    tools: emitBlockList('tools', mapTools(frontmatter, runtime)),
    turns: fm.turnsField && frontmatter.max_turns != null
      ? [`${fm.turnsField}: ${frontmatter.max_turns}`] : [],
  };

  const lines = ['---'];
  for (const fieldName of fm.fields) {
    if (Object.hasOwn(computed, fieldName)) {
      lines.push(...computed[fieldName]);
    } else if (fm[fieldName] != null) {
      lines.push(`${fieldName}: ${fm[fieldName]}`);
    } else {
      throw new Error(`Unknown agent frontmatter field "${fieldName}" for ${runtime.name}`);
    }
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
