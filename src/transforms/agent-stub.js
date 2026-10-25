'use strict';

const { toNamingConvention } = require('../lib/naming');
const { parse, escapeYaml } = require('../lib/frontmatter');
const { emitBlockList } = require('../lib/yaml-emit');
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
 *
 * @param {string} content  - Full agent file with --- delimited frontmatter
 * @param {object} runtime  - Runtime config (name, agentNaming, agentFrontmatter, tools, features)
 * @returns {string} Stub content
 */
function agentStub(content, runtime) {
  const { frontmatter, body } = parse(content);
  const examples = runtime.features?.exampleBlocks ? extractExamples(body) : [];
  const fm = runtime.agentFrontmatter;

  const name = toNamingConvention(frontmatter.name, runtime.agentNaming);
  const baseDescription = frontmatter.description || '';
  const description = examples.length ? baseDescription + '\n\n' + examples.join('\n') : baseDescription;
  const fields = {
    name: name != null && name !== '' ? [`name: ${name}`] : [],
    kind: fm.kind ? [`kind: ${fm.kind}`] : [],
    description: runtime.features?.exampleBlocks && description.includes('\n')
      ? ['description: |', ...description.split('\n').map((line) => `  ${line}`)]
      : [`description: "${escapeYaml(frontmatter.description || '')}"`],
    subagent: fm.subagent != null ? [`subagent: ${fm.subagent}`] : [],
    mainAgent: fm.mainAgent != null ? [`mainAgent: ${fm.mainAgent}`] : [],
    model: fm.model ? [`model: ${fm.model}`] : [],
    color: frontmatter.color ? [`color: ${frontmatter.color}`] : [],
    tools: emitBlockList('tools', mapTools(frontmatter, runtime)),
    turns: fm.turnsField && frontmatter.max_turns != null
      ? [`${fm.turnsField}: ${frontmatter.max_turns}`] : [],
  };

  const lines = ['---'];
  for (const fieldName of fm.fields) {
    lines.push(...fields[fieldName]);
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
