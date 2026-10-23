'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Run a synchronous operation in a scratch directory, cleaning up on every exit. */
function withTempDir(prefix, operation) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return operation(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = { withTempDir };
