import type { RuntimeConfig } from '../platforms/runtime-descriptor.js';
import agentStub from './agent-stub.js';
import extractExamples from './extract-examples.js';
import parseFrontmatter from './parse-frontmatter.js';
import rebuildFrontmatter from './rebuild-frontmatter.js';
import skillDiscoveryStub from './skill-discovery-stub.js';
import skillMetadata from './skill-metadata.js';

export interface TransformContext<State extends object = Record<string, unknown>> {
  readonly src: string;
  readonly outputPath: string;
  readonly runtime: RuntimeConfig;
  readonly param?: string;
  readonly state: State;
}

export type TransformFn<State extends object = Record<string, unknown>> = (
  content: string,
  runtime: RuntimeConfig,
  context: Omit<TransformContext<State>, 'runtime'>
) => string;

const transforms: Record<string, TransformFn> = Object.assign(Object.create(null), {
  'agent-stub': agentStub,
  'extract-examples': extractExamples,
  'parse-frontmatter': parseFrontmatter,
  'rebuild-frontmatter': rebuildFrontmatter,
  'skill-discovery-stub': skillDiscoveryStub,
  'skill-metadata': skillMetadata,
});

function resolve(name: string): { fn: TransformFn; param: string | null } {
  const [baseName, param] = name.split(':');
  const fn = baseName ? transforms[baseName] : null;
  if (!fn) {
    throw new Error(`Unknown transform: "${baseName}"`);
  }
  return { fn, param: param || null };
}

export { resolve, transforms };
