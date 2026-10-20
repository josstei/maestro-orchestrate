'use strict';

const path = require('node:path');

/** Absolute path of the repository root. */
const ROOT = path.resolve(__dirname, '..', '..');

/** Absolute path of the canonical src/ tree. */
const SRC_ROOT = path.join(ROOT, 'src');

module.exports = {
  ROOT,
  SRC_ROOT,
};
