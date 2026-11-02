'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveVersion } = require('../../src/core/version');
const { makeTempDir, writeJson } = require('../support/fs');
const { ROOT } = require('../support/paths');

/**
 * Copies version.js and its lib/io dependency into `<root>/src`, the way a
 * detached payload lays them out, and returns the copy's resolveVersion.
 */
function loadCopiedResolveVersion(root) {
  const copiedModulePath = path.join(root, 'src', 'core', 'version.js');
  const copiedIoPath = path.join(root, 'src', 'lib', 'io', 'index.js');
  fs.mkdirSync(path.dirname(copiedModulePath), { recursive: true });
  fs.mkdirSync(path.dirname(copiedIoPath), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'src', 'core', 'version.js'), copiedModulePath);
  fs.copyFileSync(path.join(ROOT, 'src', 'lib', 'io', 'index.js'), copiedIoPath);

  delete require.cache[copiedModulePath];
  delete require.cache[copiedIoPath];
  return require(copiedModulePath).resolveVersion;
}

describe('resolveVersion', () => {
  it('reads the repo package.json beside src/', () => {
    const pkg = require('../../package.json');
    assert.equal(resolveVersion(), pkg.version);
  });

  for (const [title, files, expected] of [
    ['reads src/version.json when no package.json sits beside src/',
      { 'src/version.json': { version: '9.9.9' } }, '9.9.9'],
    ['prefers the Maestro package.json beside src/ over src/version.json',
      { 'package.json': { name: '@josstei/maestro', version: '8.8.8' }, 'src/version.json': { version: '9.9.9' } }, '8.8.8'],
    ['ignores a package.json beside src/ that is not the Maestro package',
      { 'package.json': { name: 'host-project', version: '0.0.1' }, 'src/version.json': { version: '9.9.9' } }, '9.9.9'],
    ['returns unknown when neither package.json nor version.json is found', {}, 'unknown'],
  ]) {
    it(title, () => {
      const root = makeTempDir('maestro-version-');
      for (const [file, json] of Object.entries(files)) writeJson(path.join(root, file), json);
      assert.equal(loadCopiedResolveVersion(root)(), expected);
    });
  }
});
