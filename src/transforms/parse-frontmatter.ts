import { parse } from '../lib/frontmatter/index.js';
import type { Frontmatter } from '../lib/frontmatter/index.js';
import type { RuntimeConfig } from '../platforms/runtime-descriptor.js';
import type { TransformContext } from './index.js';

export interface FrontmatterTransformState extends Record<string, unknown> {
  frontmatter?: Frontmatter;
  body?: string;
  examples?: string[];
}

/**
 * Transform: parse-frontmatter
 *
 * Parses YAML frontmatter from agent content and stores the parsed
 * frontmatter object and body string into the shared pipeline state.
 *
 * @param {string} content  - Full agent file with --- delimited frontmatter
 * @param {object} _runtime - Runtime config (unused)
 * @param {object} options  - Pipeline options with shared state
 * @returns {string} Content passed through unchanged
 */
function parseFrontmatterTransform(
  content: string,
  _runtime: RuntimeConfig,
  options: Omit<TransformContext<FrontmatterTransformState>, 'runtime'>
): string {
  const { frontmatter, body } = parse(content);
  options.state.frontmatter = frontmatter;
  options.state.body = body;
  return content;
}

export default parseFrontmatterTransform;
