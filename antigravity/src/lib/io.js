'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_STDIN_BYTES = 1024 * 1024;

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
 * Reads a file as UTF-8, or returns '' on any error (missing file, permission
 * denied, a directory, etc.).
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @returns {string} File contents, or '' when reading fails
 */
function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Reads a file and parses it as JSON, or returns null on any error (missing
 * file, invalid JSON, etc.).
 *
 * @param {string} filePath - Absolute or relative path to the file
 * @returns {*} Parsed JSON value, or null when reading or parsing fails
 */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Reads all of stdin, up to 1 MiB. The raw chunks are decoded as UTF-8 once at
 * the end, so a multi-byte sequence split across chunks decodes intact.
 *
 * @returns {Promise<string>} Rejects with `Stdin payload too large`, and stops
 *   reading, once the payload exceeds the cap
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    process.stdin.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_STDIN_BYTES) {
        process.stdin.destroy();
        reject(new Error('Stdin payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
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
  readStdin,
};
