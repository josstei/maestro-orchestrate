import { parse } from '../lib/frontmatter/index.js';
function stringValue(value) {
    return typeof value === 'string' ? value : '';
}
function skillDiscoveryStub(content, runtime) {
    const { frontmatter } = parse(content);
    const name = stringValue(frontmatter.name);
    const description = stringValue(frontmatter.description);
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
export default skillDiscoveryStub;
