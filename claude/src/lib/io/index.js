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
 * Writes content to a file only when it differs from existing content.
 * Creates parent directories if they do not exist.
 *
 * @param {string} filePath - Absolute path to the target file
 * @param {string} content - Content to write
 * @returns {boolean} True if the file was written, false if content was identical
 */
function writeIfChanged(filePath, content) {
  const existing = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : null;

  if (existing === content) {
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

/**
 * Ensures a directory exists, creating it and all parent directories as needed.
 *
 * @param {string} dirPath - Absolute path to the directory
 */
function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

module.exports = {
  atomicWriteSync,
  readFileSafe,
  readJsonSafe,
  writeIfChanged,
  ensureDir,
};
