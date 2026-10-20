'use strict';

const { parse } = require('../../lib/frontmatter');

function skillDiscoveryStub(content, runtime) {
  const { frontmatter } = parse(content);
  const name = frontmatter.name;
  const description = frontmatter.description;
  const lines = ['---'];

  if (name) {
    lines.push(`name: ${name}`);
  }
  if (description) {
    lines.push(`description: ${description}`);
  }
  // Shared skills are methodology the orchestrator loads, not commands: keep
  // them out of the host's slash-command menu.
  if (runtime.name === 'claude') {
    lines.push('user-invocable: false');
  }
  if (runtime.name === 'antigravity') {
    lines.push('disable-slash-command: true');
  }

  lines.push('---');
  lines.push('');
  lines.push(`Methodology loaded via MCP. Call \`get_skill_content(resources: ["${name}"])\`.`);
  lines.push('');

  return lines.join('\n');
}

module.exports = skillDiscoveryStub;
