const injectFrontmatter = require('./inject-frontmatter');
const skillMetadata = require('./skill-metadata');
const agentStub = require('./agent-stub');
const skillDiscoveryStub = require('./skill-discovery-stub');

const transforms = {
  'inject-frontmatter': injectFrontmatter,
  'skill-metadata': skillMetadata,
  'agent-stub': agentStub,
  'skill-discovery-stub': skillDiscoveryStub,
};

/**
 * Resolve a transform name to its function.
 * Supports parameterized transforms like 'strip-feature:flagName'.
 * @param {string} name
 * @returns {{ fn: Function, param: string|null }}
 */
function resolve(name) {
  const [baseName, param] = name.split(':');
  const fn = transforms[baseName];
  if (!fn) {
    throw new Error(`Unknown transform: "${baseName}"`);
  }
  return { fn, param: param || null };
}

module.exports = { resolve, transforms };
