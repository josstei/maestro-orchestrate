import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PACKAGE_NAME,
  findPackageRoot,
  moduleDirname,
  moduleFilename,
  resolvePackageRoot,
} from '../../dist/src/core/package-root.js';

function writePackageJson(dirPath, value) {
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(
    path.join(dirPath, 'package.json'),
    typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`,
    'utf8'
  );
}

function malformedJsonMessage(raw) {
  try {
    JSON.parse(raw);
  } catch (error) {
    return error.message;
  }
  throw new Error('Expected malformed JSON fixture');
}

describe('package-root primitives', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function makeRoot() {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-package-root-'));
    return tempDir;
  }

  it('finds the named package from a nested directory', () => {
    const root = makeRoot();
    const nested = path.join(root, 'dist', 'src', 'mcp');
    writePackageJson(root, { name: PACKAGE_NAME });
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(findPackageRoot(nested), root);
    assert.equal(resolvePackageRoot(nested), root);
  });

  it('skips an unrelated package and requires the requested package name', () => {
    const root = makeRoot();
    const unrelated = path.join(root, 'workspace');
    const nested = path.join(unrelated, 'src');
    writePackageJson(root, { name: PACKAGE_NAME });
    writePackageJson(unrelated, { name: 'unrelated-package' });
    fs.mkdirSync(nested, { recursive: true });

    assert.equal(findPackageRoot(nested), root);
    assert.equal(findPackageRoot(nested, { packageName: 'unrelated-package' }), unrelated);
  });

  it('returns null or throws the exact error when the package root is missing', () => {
    const startDir = path.join(makeRoot(), 'unrelated', 'nested');
    fs.mkdirSync(startDir, { recursive: true });

    assert.equal(findPackageRoot(startDir), null);
    assert.throws(
      () => resolvePackageRoot(startDir),
      new Error(`Unable to locate ${PACKAGE_NAME} package root from ${startDir}`)
    );
  });

  it('skips malformed package.json in the current directory under the skip policy', () => {
    const root = makeRoot();
    const startDir = path.join(root, 'nested');
    writePackageJson(root, { name: PACKAGE_NAME });
    writePackageJson(startDir, '{not json');

    assert.equal(findPackageRoot(startDir, { malformedJson: 'skip' }), root);
  });

  it('throws the original parse error for malformed package.json in the current directory', () => {
    const startDir = makeRoot();
    const raw = '{not json';
    writePackageJson(startDir, raw);

    assert.throws(
      () => findPackageRoot(startDir, { malformedJson: 'throw' }),
      (error) => error instanceof SyntaxError && error.message === malformedJsonMessage(raw)
    );
  });

  it('skips a malformed ancestor package.json under the skip policy', () => {
    const root = makeRoot();
    const malformedAncestor = path.join(root, 'workspace');
    const startDir = path.join(malformedAncestor, 'src', 'nested');
    writePackageJson(root, { name: PACKAGE_NAME });
    writePackageJson(malformedAncestor, '{not json');
    fs.mkdirSync(startDir, { recursive: true });

    assert.equal(resolvePackageRoot(startDir, { malformedJson: 'skip' }), root);
  });

  it('throws the original parse error for malformed ancestor package.json under the throw policy', () => {
    const root = makeRoot();
    const malformedAncestor = path.join(root, 'workspace');
    const startDir = path.join(malformedAncestor, 'src', 'nested');
    const raw = '{not json';
    writePackageJson(root, { name: PACKAGE_NAME });
    writePackageJson(malformedAncestor, raw);
    fs.mkdirSync(startDir, { recursive: true });

    assert.throws(
      () => resolvePackageRoot(startDir, { malformedJson: 'throw' }),
      (error) => error instanceof SyntaxError && error.message === malformedJsonMessage(raw)
    );
  });
});

describe('module-path primitives', () => {
  it('resolves a module URL to its filename and directory', () => {
    const filename = path.join(os.tmpdir(), 'maestro module.js');
    const moduleUrl = pathToFileURL(filename).href;

    assert.equal(moduleFilename(moduleUrl), filename);
    assert.equal(moduleDirname(moduleUrl), path.dirname(filename));
  });
});
