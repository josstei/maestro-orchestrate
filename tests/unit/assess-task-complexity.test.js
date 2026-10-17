'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const {
  handleAssessTaskComplexity,
} = require('../../src/mcp/handlers/assess-task-complexity');
const { makeTempDir, writeTree } = require('../support/fs');

describe('handleAssessTaskComplexity', () => {
  let root;

  beforeEach(() => {
    root = makeTempDir('maestro-assess-');
  });

  it('reports repo_is_empty=true for an empty directory', () => {
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
    for (let i = 0; i < 5; i++) writeTree(root, `file-${i}.js`, '');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 5);
    assert.equal(result.repo_size_estimate, 'small');
    assert.equal(result.lines_of_code_estimate, 'low');
    assert.equal(result.repo_is_empty, false);
  });

  it('classifies a medium repo (21–200 files)', () => {
    for (let i = 0; i < 50; i++) writeTree(root, `src/file-${i}.js`, '');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 50);
    assert.equal(result.repo_size_estimate, 'medium');
    assert.equal(result.lines_of_code_estimate, 'moderate');
  });

  it('classifies a large repo (>200 files)', () => {
    for (let i = 0; i < 210; i++) writeTree(root, `src/file-${i}.js`, '');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 210);
    assert.equal(result.repo_size_estimate, 'large');
    assert.equal(result.lines_of_code_estimate, 'high');
  });

  it('tracks directory depth', () => {
    writeTree(root, 'a/b/c/d/e/deep.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.ok(result.directory_depth >= 5);
  });

  it('skips well-known vendored / build directories', () => {
    writeTree(root, 'node_modules/foo/index.js');
    writeTree(root, '.git/HEAD');
    writeTree(root, 'dist/bundle.js');
    writeTree(root, 'src/real.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.file_count, 1);
  });

  it('detects package.json, config files, and tests directory', () => {
    writeTree(root, 'package.json', '{}');
    writeTree(root, 'tsconfig.json', '{}');
    writeTree(root, 'Dockerfile', 'FROM node');
    writeTree(root, 'tests/x.test.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.has_package_json, true);
    assert.deepEqual(
      result.has_config_files.sort(),
      ['Dockerfile', 'tsconfig.json'].sort()
    );
    assert.equal(result.existing_test_infrastructure, true);
  });

  it('detects the __tests__ directory convention', () => {
    writeTree(root, '__tests__/foo.test.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.existing_test_infrastructure, true);
  });

  it('detects the test/ directory convention', () => {
    writeTree(root, 'test/foo.test.js');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.existing_test_infrastructure, true);
  });

  it('detects frameworks listed in dependencies', () => {
    writeTree(
      root,
      'package.json',
      JSON.stringify({ dependencies: { react: '^18.0.0', express: '^4.0.0' } })
    );
    const result = handleAssessTaskComplexity({}, root);
    assert.deepEqual(result.frameworks_detected.sort(), ['express', 'react']);
  });

  it('detects frameworks listed in devDependencies', () => {
    writeTree(
      root,
      'package.json',
      JSON.stringify({ devDependencies: { next: '^14.0.0' } })
    );
    const result = handleAssessTaskComplexity({}, root);
    assert.deepEqual(result.frameworks_detected, ['next']);
  });

  it('returns no frameworks when package.json is unparseable', () => {
    writeTree(root, 'package.json', '{not json');
    const result = handleAssessTaskComplexity({}, root);
    assert.equal(result.has_package_json, true);
    assert.deepEqual(result.frameworks_detected, []);
  });

  it('returns no frameworks when package.json has no dependencies', () => {
    writeTree(root, 'package.json', '{}');
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
