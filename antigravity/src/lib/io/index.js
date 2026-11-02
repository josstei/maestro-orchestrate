'use strict';

const fs = require('node:fs');
const path = require('node:path');

let counter = 0;

/** Write through a unique temp file and rename; parents get mode 0o700 and the file 0o600. */
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

function readFileSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

/** The file's UTF-8 text with CRLF normalized to LF, so a CRLF checkout parses like an LF one. */
function readTextSync(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function formatJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

module.exports = {
  atomicWriteSync,
  formatJson,
  readFileSafe,
  readJsonSafe,
  readTextSync,
};
