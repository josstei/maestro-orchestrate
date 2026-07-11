import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleDirname } from '../core/package-root.js';
import { discover } from '../lib/discovery/index.js';
import type { RuntimeConfig } from '../platforms/runtime-descriptor.js';

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

const TRANSFORMS_DIR = path.resolve(moduleDirname(import.meta.url));

const entries = discover({
  dir: TRANSFORMS_DIR,
  pattern: '*.js',
  identity: (filepath) => path.basename(filepath, '.js'),
  validate: (entry) => entry.id !== 'index',
});

const transforms: Record<string, TransformFn> = Object.create(null);

for (const entry of entries) {
  const { default: transform } = await import(pathToFileURL(path.join(TRANSFORMS_DIR, `${entry.id}.js`)).href) as { default: TransformFn };
  transforms[entry.id] = transform;
}

/**
 * Resolve a transform name to its function.
 * Supports parameterized transforms like 'strip-feature:flagName'.
 */
function resolve(name: string): { fn: TransformFn; param: string | null } {
  const [baseName, param] = name.split(':');
  const fn = baseName ? transforms[baseName] : null;
  if (!fn) {
    throw new Error(`Unknown transform: "${baseName}"`);
  }
  return { fn, param: param || null };
}

export { resolve, transforms };
