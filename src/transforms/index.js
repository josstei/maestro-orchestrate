'use strict';

const path = require('node:path');
const { discover } = require('../lib/discovery');

const TRANSFORMS_DIR = path.resolve(__dirname);

const entries = discover({
  dir: TRANSFORMS_DIR,
  pattern: '*.js',
  identity: (filepath) => path.basename(filepath, '.js'),
  validate: (entry) => entry.id !== 'index',
});

const transforms = Object.create(null);
for (const entry of entries) {
  transforms[entry.id] = require(path.join(TRANSFORMS_DIR, `${entry.id}.js`));
}

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

module.exports = { resolve, transforms };
