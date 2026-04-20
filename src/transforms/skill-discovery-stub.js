const { parse } = require('../lib/frontmatter');

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
  if (runtime.name === 'claude') {
    lines.push('user-invocable: false');
  }

  lines.push('---');
  lines.push('');
  lines.push(`Methodology loaded via MCP. Call \`get_skill_content(resources: ["${name}"])\`.`);
  lines.push('');

  return lines.join('\n');
}

module.exports = skillDiscoveryStub;
