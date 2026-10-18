'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveVersion } = require('../../src/core/version');
const { makeTempDir } = require('../support/fs');
const { ROOT } = require('../support/paths');

describe('resolveVersion', () => {
  it('resolves version from package.json when called from the repo', () => {
    const pkg = require('../../package.json');
    assert.equal(resolveVersion(__dirname), pkg.version);
  });

  it('resolves version from src/mcp directory', () => {
    const pkg = require('../../package.json');
    assert.equal(resolveVersion(path.join(ROOT, 'src', 'mcp')), pkg.version);
  });

  it('returns unknown when no package.json or version.json is found', () => {
    assert.equal(resolveVersion('/'), 'unknown');
  });

  it('reads version.json when package.json lookup fails', () => {
    const tempDir = makeTempDir('maestro-version-');

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

    delete require.cache[copiedModulePath];
    delete require.cache[path.join(libIoDir, 'index.js')];
    const { resolveVersion: resolveVersionFromTemp } = require(copiedModulePath);

    assert.equal(resolveVersionFromTemp(entrypointDir), '9.9.9');
  });
});
