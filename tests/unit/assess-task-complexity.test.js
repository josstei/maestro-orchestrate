'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  handleAssessTaskComplexity,
} = require('../../src/mcp/handlers/assess-task-complexity');

const tmpRoots = [];

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-assess-'));
  tmpRoots.push(dir);
  return dir;
}

function writeFile(root, relPath, contents = '') {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

after(() => {
  for (const root of tmpRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('handleAssessTaskComplexity', () => {
  it('reports repo_is_empty=true for an empty directory', () => {
    const root = makeRepo();
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.repo_is_empty, true);
    assert.equal(result.file_count, 0);
    assert.equal(result.repo_size_estimate, 'empty');
    assert.equal(result.lines_of_code_estimate, 'low');
    assert.equal(result.has_package_json, false);
    assert.deepEqual(result.has_config_files, []);
    assert.deepEqual(result.frameworks_detected, []);
    assert.equal(result.existing_test_infrastructure, false);
  });

  it('classifies a small repo (<=20 files) correctly', () => {
    const root = makeRepo();
    for (let i = 0; i < 5; i++) writeFile(root, `file-${i}.js`, '');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 5);
    assert.equal(result.repo_size_estimate, 'small');
    assert.equal(result.lines_of_code_estimate, 'low');
    assert.equal(result.repo_is_empty, false);
  });

  it('classifies a medium repo (21–200 files)', () => {
    const root = makeRepo();
    for (let i = 0; i < 50; i++) writeFile(root, `src/file-${i}.js`, '');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 50);
    assert.equal(result.repo_size_estimate, 'medium');
    assert.equal(result.lines_of_code_estimate, 'moderate');
  });

  it('classifies a large repo (>200 files)', () => {
    const root = makeRepo();
    for (let i = 0; i < 210; i++) writeFile(root, `src/file-${i}.js`, '');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 210);
    assert.equal(result.repo_size_estimate, 'large');
    assert.equal(result.lines_of_code_estimate, 'high');
  });

  it('tracks directory depth', () => {
    const root = makeRepo();
    writeFile(root, 'a/b/c/d/e/deep.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.ok(result.directory_depth >= 5);
  });

  it('skips well-known vendored / build directories', () => {
    const root = makeRepo();
    writeFile(root, 'node_modules/foo/index.js');
    writeFile(root, '.git/HEAD');
    writeFile(root, 'dist/bundle.js');
    writeFile(root, 'src/real.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 1);
  });

  it('detects package.json, config files, and tests directory', () => {
    const root = makeRepo();
    writeFile(root, 'package.json', '{}');
    writeFile(root, 'tsconfig.json', '{}');
    writeFile(root, 'Dockerfile', 'FROM node');
    writeFile(root, 'tests/x.test.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.has_package_json, true);
    assert.deepEqual(
      result.has_config_files.sort(),
      ['Dockerfile', 'tsconfig.json'].sort()
    );
    assert.equal(result.existing_test_infrastructure, true);
  });

  it('detects the __tests__ directory convention', () => {
    const root = makeRepo();
    writeFile(root, '__tests__/foo.test.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.existing_test_infrastructure, true);
  });

  it('detects the test/ directory convention', () => {
    const root = makeRepo();
    writeFile(root, 'test/foo.test.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.existing_test_infrastructure, true);
  });

  it('detects frameworks listed in dependencies', () => {
    const root = makeRepo();
    writeFile(
      root,
      'package.json',
      JSON.stringify({ dependencies: { react: '^18.0.0', express: '^4.0.0' } })
    );
    const result = handleAssessTaskComplexity({}, root);
    assert.deepEqual(result.frameworks_detected.sort(), ['express', 'react']);
  });

  it('detects frameworks listed in devDependencies', () => {
    const root = makeRepo();
    writeFile(
      root,
      'package.json',
      JSON.stringify({ devDependencies: { next: '^14.0.0' } })
    );
    const result = handleAssessTaskComplexity({}, root);
    assert.deepEqual(result.frameworks_detected, ['next']);
  });

  it('returns no frameworks when package.json is unparseable', () => {
    const root = makeRepo();
    writeFile(root, 'package.json', '{not json');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.has_package_json, true);
    assert.deepEqual(result.frameworks_detected, []);
  });

  it('returns no frameworks when package.json has no dependencies', () => {
    const root = makeRepo();
    writeFile(root, 'package.json', '{}');
    const result = handleAssessTaskComplexity({}, root);
    assert.deepEqual(result.frameworks_detected, []);
  });

  it('swallows readdir errors on unreadable directories', () => {
    const missing = path.join(os.tmpdir(), `maestro-assess-missing-${Date.now()}-${process.pid}`);
    const result = handleAssessTaskComplexity({}, missing);
    assert.equal(result.file_count, 0);
    assert.equal(result.repo_is_empty, true);
  });
});
