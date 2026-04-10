function getFrontmatterValue(content, key) {
  const match = content.match(new RegExp(`(?:^|\\n)${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : null;
}

function skillDiscoveryStub(content, runtime) {
  const name = getFrontmatterValue(content, 'name');
  const description = getFrontmatterValue(content, 'description');
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
