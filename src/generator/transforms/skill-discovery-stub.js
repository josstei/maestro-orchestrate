'use strict';

const { parse } = require('../../lib/frontmatter');

/**
 * Transform: skill-discovery-stub
 *
 * Builds a shared skill's discovery stub: its name and description, the
 * runtime's `skillFrontmatter` fields, then a body that points at the MCP
 * `get_skill_content` tool. The source methodology body is not emitted.
 *
 * @param {string} content - Full SKILL.md with --- delimited frontmatter
 * @param {object} runtime - Runtime config (skillFrontmatter)
 * @returns {string} Stub content
 */
function skillDiscoveryStub(content, runtime) {
  const { name, description } = parse(content).frontmatter;

  return [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    ...Object.entries(runtime.skillFrontmatter).map(([key, value]) => `${key}: ${value}`),
    '---',
    '',
    `Methodology loaded via MCP. Call \`get_skill_content(resources: ["${name}"])\`.`,
    '',
  ].join('\n');
}

module.exports = skillDiscoveryStub;
