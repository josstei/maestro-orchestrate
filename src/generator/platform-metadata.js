'use strict';

const { formatJson } = require('../lib/io');
const { RUNTIME_NAMES } = require('../platforms/runtime-config-map');

const RUNTIME_DESCRIPTION = 'Multi-agent development orchestration platform — 39 specialists, 4-phase orchestration, native parallel subagents, persistent sessions, and standalone review/debug/security/perf/seo/a11y/compliance commands';

const BASE_KEYWORDS = ['orchestration', 'multi-agent', 'planning', 'execution'];

const DEFAULT_PROMPTS = [
  'Use Maestro to orchestrate a feature from design through implementation and review.',
  'Use Maestro to review my changes and block on critical or major findings.',
  'Use Maestro to debug a failing workflow and route investigation to the right specialist.',
];

/**
 * What every runtime's `metadataFiles` renders from.
 * @typedef {object} MetadataContext
 * @property {string} name - npm package name
 * @property {string} version - Package version
 * @property {{ name: string, email: string, url: string }} author - Package
 *   author, keys in this order
 * @property {string} homepage
 * @property {string} repository - Repository URL without its .git suffix
 * @property {string} license
 * @property {string} description - Product description the manifests share
 * @property {string[]} keywords - Base keywords the manifests extend
 * @property {string[]} defaultPrompts - Suggested starter prompts
 */

/**
 * Every runtime's manifests, marketplace files, hook registrations and policy
 * pack: the [outputPath, value] pairs each runtimes/<runtime>/outputs.js
 * `metadataFiles` returns, in runtime order. String values are written as-is;
 * anything else is written as JSON.
 * @param {object} pkg - Parsed package.json
 * @returns {Array<{ outputPath: string, content: string }>}
 */
function buildPlatformMetadataOutputs(pkg) {
  /** @type {MetadataContext} */
  const context = {
    name: pkg.name,
    version: pkg.version,
    author: { name: pkg.author.name, email: pkg.author.email, url: pkg.author.url },
    homepage: pkg.homepage,
    repository: pkg.repository.url.replace(/\.git$/, ''),
    license: pkg.license,
    description: RUNTIME_DESCRIPTION,
    keywords: BASE_KEYWORDS,
    defaultPrompts: DEFAULT_PROMPTS,
  };

  return RUNTIME_NAMES.flatMap((runtimeName) =>
    require(`./runtimes/${runtimeName}/outputs`).metadataFiles(context).map(([outputPath, value]) => ({
      outputPath,
      content: typeof value === 'string' ? value : formatJson(value),
    }))
  );
}

module.exports = { buildPlatformMetadataOutputs };
