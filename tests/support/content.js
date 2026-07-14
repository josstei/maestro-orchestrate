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

function writeRuntimeContentManifest(srcRoot, manifest = {}) {
  return writeFileUnder(
    srcRoot,
    path.join('generated', 'runtime-content-registry.json'),
    `${JSON.stringify({
      schemaVersion: 2,
      storage: 'file',
      resources: {},
      agents: {},
      agentProfiles: {},
      blueprints: {},
      ...manifest,
    }, null, 2)}\n`
  );
}

function registerFileEntry(srcRoot, section, id, relativePath) {
  const manifestPath = path.join(srcRoot, 'generated', 'runtime-content-registry.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {
      schemaVersion: 2,
      storage: 'file',
      resources: {},
      agents: {},
      agentProfiles: {},
      blueprints: {},
    };
  manifest[section][id] = relativePath;
  writeRuntimeContentManifest(srcRoot, manifest);
}

function writeAgent(srcRoot, name, body) {
  const relativePath = path.posix.join('agents', `${name}.md`);
  const filePath = writeFileUnder(srcRoot, relativePath, body);
  registerFileEntry(srcRoot, 'agents', name, relativePath);
  return filePath;
}

function writeResource(srcRoot, id, body) {
  const relativePath = RESOURCE_ALLOWLIST[id];
  const filePath = writeFileUnder(srcRoot, relativePath, body);
  registerFileEntry(srcRoot, 'resources', id, relativePath);
  return filePath;
}

function withExtensionRoot(value, fn) {
  return withEnvSync({
    MAESTRO_EXTENSION_PATH: value === undefined ? undefined : String(value),
  }, fn);
}

export { makeTempSrcRoot, cleanupTempRoots, writeFileUnder, writeRuntimeContentManifest, writeAgent, writeResource, withExtensionRoot };
