import fs from 'node:fs';
import path from 'node:path';
import { importDist } from './dist.js';
import { withEnvSync } from './environment.js';
import { makeTempDir, writeFixtureFile } from './filesystem.js';

const { RESOURCE_ALLOWLIST } = await importDist('src/mcp/content/runtime-content.js');
const createdRoots = [];

function makeTempSrcRoot(prefix = 'maestro-content-') {
  const root = makeTempDir(null, prefix);
  createdRoots.push(root);
  return root;
}

function cleanupTempRoots() {
  while (createdRoots.length > 0) {
    fs.rmSync(createdRoots.pop(), { recursive: true, force: true });
  }
}

function writeFileUnder(root, relPath, content) {
  return writeFixtureFile(root, relPath, content);
}

function writeAgent(srcRoot, name, body) {
  return writeFileUnder(srcRoot, path.join('agents', `${name}.md`), body);
}

function writeResource(srcRoot, id, body) {
  return writeFileUnder(srcRoot, RESOURCE_ALLOWLIST[id], body);
}

function withExtensionRoot(value, fn) {
  return withEnvSync({
    MAESTRO_EXTENSION_PATH: value === undefined ? undefined : String(value),
  }, fn);
}

export { makeTempSrcRoot, cleanupTempRoots, writeFileUnder, writeAgent, writeResource, withExtensionRoot };
