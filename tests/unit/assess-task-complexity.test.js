'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  handleAssessTaskComplexity,
} = require('../../src/mcp/handlers/assess-task-complexity');
const { makeTempDir, writeTree } = require('../support/fs');

/** Assesses a fresh temp directory seeded with `files` (relative path -> content). */
function assess(files = {}) {
  const root = makeTempDir('maestro-assess-');
  for (const [file, content] of Object.entries(files)) writeTree(root, file, content);
  return handleAssessTaskComplexity({}, root);
}

const emptyFiles = (count, dir = '') =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`${dir}file-${i}.js`, '']));

describe('handleAssessTaskComplexity', () => {
  // Each case checks only the listed fields; array fields compare sorted.
  for (const [name, files, expected] of [
    ['reports repo_is_empty=true for an empty directory', {}, {
      repo_is_empty: true, file_count: 0, repo_size_estimate: 'empty', lines_of_code_estimate: 'low',
      has_package_json: false, has_config_files: [], frameworks_detected: [], existing_test_infrastructure: false,
    }],
    ['classifies a small repo (<=20 files) correctly', emptyFiles(5),
      { file_count: 5, repo_size_estimate: 'small', lines_of_code_estimate: 'low', repo_is_empty: false }],
    ['classifies a medium repo (21–200 files)', emptyFiles(50, 'src/'),
      { file_count: 50, repo_size_estimate: 'medium', lines_of_code_estimate: 'moderate' }],
    ['classifies a large repo (>200 files)', emptyFiles(210, 'src/'),
      { file_count: 210, repo_size_estimate: 'large', lines_of_code_estimate: 'high' }],
    ['tracks directory depth', { 'a/b/c/d/e/deep.js': '' }, { directory_depth: 5 }],
    ['skips well-known vendored / build directories',
      { 'node_modules/foo/index.js': '', '.git/HEAD': '', 'dist/bundle.js': '', 'src/real.js': '' }, { file_count: 1 }],
    ['detects package.json, config files, and tests directory',
      { 'package.json': '{}', 'tsconfig.json': '{}', Dockerfile: 'FROM node', 'tests/x.test.js': '' },
      { has_package_json: true, has_config_files: ['Dockerfile', 'tsconfig.json'],
        existing_test_infrastructure: true }],
    ['detects the __tests__ directory convention',
      { '__tests__/foo.test.js': '' }, { existing_test_infrastructure: true }],
    ['detects the test/ directory convention', { 'test/foo.test.js': '' }, { existing_test_infrastructure: true }],
    ['detects frameworks listed in dependencies',
      { 'package.json': JSON.stringify({ dependencies: { react: '^18.0.0', express: '^4.0.0' } }) },
      { frameworks_detected: ['express', 'react'] }],
    ['detects frameworks listed in devDependencies',
      { 'package.json': JSON.stringify({ devDependencies: { next: '^14.0.0' } }) }, { frameworks_detected: ['next'] }],
    ['returns no frameworks when package.json is unparseable',
      { 'package.json': '{not json' }, { has_package_json: true, frameworks_detected: [] }],
    ['returns no frameworks when package.json has no dependencies',
      { 'package.json': '{}' }, { frameworks_detected: [] }],
  ]) {
    it(name, () => {
      const result = assess(files);
      for (const [field, value] of Object.entries(expected)) {
        // Sorted in place, so a list field that is not an array still fails.
        assert.deepEqual(Array.isArray(value) ? result[field].sort() : result[field], value, field);
      }
    });
  }

  it('swallows readdir errors on unreadable directories', () => {
    const result = handleAssessTaskComplexity({}, path.join(makeTempDir('maestro-assess-'), 'missing'));
    assert.equal(result.file_count, 0);
    assert.equal(result.repo_is_empty, true);
  });
});
