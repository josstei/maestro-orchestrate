'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { escapeRegExp } = require('../naming');

/**
 * Return regular file paths matching a filename pattern. `*` matches within
 * the filename; a leading double-star segment also scans subdirectories. Other characters
 * are literal. Discovery never reads file contents or follows symlink entries.
 */
function findFiles(dir, pattern) {
  const recursive = pattern.startsWith('**/');
  const filename = recursive ? pattern.slice(3) : pattern;
  const regex = new RegExp('^' + filename.split('*').map(escapeRegExp).join('[^/]*') + '$');
  const files = [];

  function visit(current) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory() && recursive) visit(file);
      else if (entry.isFile() && regex.test(entry.name)) files.push(file);
    }
  }

  visit(dir);
  return files;
}

module.exports = { findFiles };
