'use strict';

const fs = require('node:fs');

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

module.exports = {
  readFileSafe,
  readJsonSafe,
};
