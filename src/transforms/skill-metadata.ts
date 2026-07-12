import { splitAtBoundary } from '../lib/frontmatter/index.js';
import type { RuntimeConfig } from '../platforms/runtime-descriptor.js';

function skillMetadata(content: string, runtime: RuntimeConfig): string {
  if (runtime.name !== 'claude') return content;

  const { raw, body } = splitAtBoundary(content);
  if (!raw) return content;

  return '---\n' + raw + '\nuser-invocable: false\n---' + (body ? '\n' + body : '');
}

export default skillMetadata;
