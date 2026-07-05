import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveVersion } from '../../src/core/version.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '..', '..');

function cleanupTempDir(dirPath) {
  if (dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
const packageJson2 = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));

describe('resolveVersion', () => {
  let tempDir = null;

  afterEach(() => {
    cleanupTempDir(tempDir);
    tempDir = null;
  });

  it('resolves version from package.json when called from the repo', () => {
    const pkg = packageJson;
    assert.equal(resolveVersion(moduleDirname), pkg.version);
  });

  it('resolves version from src/mcp directory', () => {
    const pkg = packageJson2;
    assert.equal(resolveVersion(path.join(ROOT, 'src', 'mcp')), pkg.version);
  });

  it('returns unknown when no package.json or version.json is found', () => {
    assert.equal(resolveVersion('/'), 'unknown');
  });

  it('reads version.json when package.json lookup fails', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-version-'));

    const srcDir = path.join(tempDir, 'src');
    const coreDir = path.join(srcDir, 'core');
    const entrypointDir = path.join(tempDir, 'sandbox');
    const copiedModulePath = path.join(coreDir, 'version.js');

    const libIoDir = path.join(srcDir, 'lib', 'io');
    fs.mkdirSync(coreDir, { recursive: true });
    fs.mkdirSync(entrypointDir, { recursive: true });
    fs.mkdirSync(libIoDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'version.json'),
      JSON.stringify({ version: '9.9.9' }, null, 2) + '\n',
      'utf8'
    );
    fs.copyFileSync(path.join(ROOT, 'src', 'core', 'version.js'), copiedModulePath);
    fs.copyFileSync(path.join(ROOT, 'src', 'lib', 'io', 'index.js'), path.join(libIoDir, 'index.js'));

    const { resolveVersion: resolveVersionFromTemp } = await import(pathToFileURL(copiedModulePath).href);

    assert.equal(resolveVersionFromTemp(entrypointDir), '9.9.9');
  });
});
