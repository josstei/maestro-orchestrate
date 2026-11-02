'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tempDirs = new Set();

/** Removes a directory tree; a missing directory is not an error. */
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
process.once('exit', removeTempDirs);

/**
 * Creates a fresh directory under os.tmpdir() and removes it when the test
 * process exits. `node --test` runs each test file in its own process, so
 * every directory a file creates is gone once that file finishes.
 */
function makeTempDir(prefix = 'maestro-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

/** Writes `content` to `filePath`, creating missing parent directories; returns `filePath`. */
function writeFile(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

/** writeFile for `relPath` under `base`; returns the absolute path. */
function writeTree(base, relPath, content = '') {
  return writeFile(path.join(base, relPath), content);
}

/**
 * Unlike src/lib/io's readJsonSafe, a missing file or malformed JSON throws, so a
 * broken fixture fails the test.
 */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** Writes `value` as two-space-indented JSON with a trailing newline. */
function writeJson(filePath, value) {
  return writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Rewrites a JSON file after `edit` mutates its parsed value in place. */
function editJson(filePath, edit) {
  const value = readJson(filePath);
  edit(value);
  return writeJson(filePath, value);
}

module.exports = {
  editJson,
  makeTempDir,
  readJson,
  removeDir,
  writeFile,
  writeJson,
  writeTree,
};
