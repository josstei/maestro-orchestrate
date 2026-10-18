'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDirs = new Set();
let exitCleanupRegistered = false;

/**
 * Removes a directory tree. A missing directory is not an error.
 *
 * @param {string} dir - Absolute path of the directory to remove
 */
function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Removes every directory created by makeTempDir. It runs when the test
 * process exits, so it must never throw: a throw inside an 'exit' listener
 * turns a passing test file into a failing one.
 */
function removeTempDirs() {
  for (const dir of tempDirs) {
    try {
      removeDir(dir);
    } catch {
      // Best effort; a leftover temp dir must not fail the run.
    }
  }
  tempDirs.clear();
}

/**
 * Creates a fresh directory under os.tmpdir() and removes it when the test
 * process exits. `node --test` runs each test file in its own process, so
 * every directory a file creates is gone once that file finishes.
 *
 * @param {string} [prefix='maestro-test-'] - Prefix for the directory name
 * @returns {string} Absolute path of the new directory
 */
function makeTempDir(prefix = 'maestro-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  if (!exitCleanupRegistered) {
    process.once('exit', removeTempDirs);
    exitCleanupRegistered = true;
  }
  return dir;
}

/**
 * Writes `content` to `relPath` under `base`, creating missing parent
 * directories first.
 *
 * @param {string} base - Absolute path of the directory to write into
 * @param {string} relPath - Path of the file relative to `base`
 * @param {string} [content=''] - File content
 * @returns {string} Absolute path of the written file
 */
function writeTree(base, relPath, content = '') {
  const filePath = path.join(base, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

module.exports = {
  makeTempDir,
  removeDir,
  writeTree,
};
