'use strict';

/**
 * Transforms by the name manifest rules use. Each is a
 * (content, runtime) => content function. The map has no prototype, so only
 * these names resolve.
 */
const transforms = Object.assign(Object.create(null), {
  'agent-stub': require('./agent-stub'),
  'skill-discovery-stub': require('./skill-discovery-stub'),
});

/**
 * Resolve a transform name to its function.
 * @param {string} name
 * @returns {Function}
 */
function resolve(name) {
  const fn = transforms[name];
  if (!fn) {
    throw new Error(`Unknown transform: "${name}"`);
  }
  return fn;
}

module.exports = { resolve };
