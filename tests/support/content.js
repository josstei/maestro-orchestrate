'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { RESOURCE_ALLOWLIST } = require('../../src/mcp/content/runtime-content');

const createdRoots = [];

function makeTempSrcRoot(prefix = 'maestro-content-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  createdRoots.push(root);
  return root;
}

function cleanupTempRoots() {
  while (createdRoots.length > 0) {
    fs.rmSync(createdRoots.pop(), { recursive: true, force: true });
  }
}

function writeFileUnder(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
  return abs;
}

function writeAgent(srcRoot, name, body) {
  return writeFileUnder(srcRoot, path.join('agents', `${name}.md`), body);
}

function writeResource(srcRoot, id, body) {
  return writeFileUnder(srcRoot, RESOURCE_ALLOWLIST[id], body);
}

function withExtensionRoot(value, fn) {
  const prev = process.env.MAESTRO_EXTENSION_PATH;
  if (value === undefined) delete process.env.MAESTRO_EXTENSION_PATH;
  else process.env.MAESTRO_EXTENSION_PATH = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.MAESTRO_EXTENSION_PATH;
    else process.env.MAESTRO_EXTENSION_PATH = prev;
  }
}

module.exports = {
  makeTempSrcRoot,
  cleanupTempRoots,
  writeFileUnder,
  writeAgent,
  writeResource,
  withExtensionRoot,
};
