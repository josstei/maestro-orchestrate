const copy = require('./copy');
const stripFeature = require('./strip-feature');
const replaceAgentNames = require('./replace-agent-names');
const replaceToolNames = require('./replace-tool-names');
const replacePaths = require('./replace-paths');
const injectFrontmatter = require('./inject-frontmatter');

const transforms = {
  copy,
  'strip-feature': stripFeature,
  'replace-agent-names': replaceAgentNames,
  'replace-tool-names': replaceToolNames,
  'replace-paths': replacePaths,
  'inject-frontmatter': injectFrontmatter,
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
