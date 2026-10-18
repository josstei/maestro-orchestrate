'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLATFORMS_DIR = path.resolve(__dirname, '..', '..', 'platforms');

const RUNTIME_NAMES = fs.readdirSync(PLATFORMS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== 'shared')
  .filter((entry) =>
    fs.existsSync(path.join(PLATFORMS_DIR, entry.name, 'runtime-config.js'))
  )
  .map((entry) => entry.name)
  .sort();

function getRuntimeConfig(name) {
  if (!RUNTIME_NAMES.includes(name)) {
    throw new Error(`Unknown runtime config: ${name}`);
  }

  return require(path.join(PLATFORMS_DIR, name, 'runtime-config.js'));
}

module.exports = {
  RUNTIME_NAMES,
  getRuntimeConfig,
};
