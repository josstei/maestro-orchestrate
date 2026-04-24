'use strict';

const fs = require('node:fs');
const path = require('node:path');

function hasCanonicalSrcRoot(candidateRoot) {
  return fs.existsSync(path.join(candidateRoot, 'src', 'mcp', 'maestro-server.js'));
}

function resolveCanonicalProjectRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  while (true) {
    if (hasCanonicalSrcRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate canonical src/ from "${startDir}"`);
    }

    current = parent;
  }
}

function resolveCanonicalSrcRoot(startDir = process.cwd()) {
  return path.join(resolveCanonicalProjectRoot(startDir), 'src');
}

function requireFromCanonicalSrc(relativePath, startDir = process.cwd()) {
  return require(path.join(resolveCanonicalSrcRoot(startDir), relativePath));
}

module.exports = {
  requireFromCanonicalSrc,
  resolveCanonicalProjectRoot,
  resolveCanonicalSrcRoot,
};
