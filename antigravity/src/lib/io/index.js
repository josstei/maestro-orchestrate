'use strict';

const fs = require('node:fs');
const path = require('node:path');

let counter = 0;

/**
 * Creates parent directories and writes content atomically via temp-file + rename.
 * The parent directory is created with mode 0o700 and the file with mode 0o600.
 *
 * @param {string} filePath - Absolute path to the target file
 * @param {string} content - Content to write
 */
function atomicWriteSync(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tmpFile = `${filePath}.tmp.${process.pid}.${++counter}`;
  try {
    fs.writeFileSync(tmpFile, content, { mode: 0o600 });
    fs.renameSync(tmpFile, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw err;
  }
}

/**
 * Reads a file and returns its contents as a UTF-8 string.
 * Returns the fallback value on any error (missing file, permission denied, etc.).
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @param {string} [fallback=''] - Value returned when reading fails
 * @returns {string} File contents or fallback
 */
function readFileSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

/**
 * Reads a UTF-8 text file with CRLF line endings normalized to LF, so a
 * CRLF checkout parses like an LF one.
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @returns {string} File contents with LF line endings
 */
function readTextSync(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Reads a file and parses its contents as JSON.
 * Returns the fallback value on any error (missing file, invalid JSON, etc.).
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @param {*} [fallback=null] - Value returned when reading or parsing fails
 * @returns {*} Parsed JSON value or fallback
 */
function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Serialize a value to stable, newline-terminated JSON.
 *
 * @param {*} value - Any JSON-serializable value
 * @returns {string} JSON content ready to write
 */
function formatJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

/**
 * Creates a directory (and its parents) with mode 0o700, then refuses to use it
 * if it is a symlink.
 *
 * @param {string} dir - Absolute path to the directory
 * @param {string} symlinkMessage - Error message thrown when `dir` is a symlink
 * @throws {Error} When `dir` is a symlink
 */
function ensurePrivateDir(dir, symlinkMessage) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(dir).isSymbolicLink()) {
    throw new Error(symlinkMessage);
  }
}

module.exports = {
  atomicWriteSync,
  ensurePrivateDir,
  formatJson,
  readFileSafe,
  readJsonSafe,
  readTextSync,
};
