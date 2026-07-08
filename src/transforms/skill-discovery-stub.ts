import { parse } from '../lib/frontmatter/index.js';
import type { RuntimeConfig } from '../platforms/runtime-descriptor.js';

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function skillDiscoveryStub(content: string, runtime: RuntimeConfig): string {
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
