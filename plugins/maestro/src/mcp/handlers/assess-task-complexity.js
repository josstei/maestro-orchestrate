'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { readJsonSafe } = require('../../lib/io');

const CONFIG_FILES = [
  '.eslintrc',
  '.prettierrc',
  'tsconfig.json',
  'webpack.config.js',
  'vite.config.js',
  'next.config.js',
  '.env',
  'docker-compose.yml',
  'Dockerfile',
  'Makefile',
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  'venv',
  '.venv',
  'target',
  'vendor',
  '.cache',
  '.output',
  'coverage',
  '.nyc_output',
  '.pytest_cache',
]);

const FRAMEWORK_INDICATORS = {
  react: ['react', 'react-dom'],
  vue: ['vue'],
  angular: ['@angular/core'],
  next: ['next'],
  express: ['express'],
  fastify: ['fastify'],
  django: ['django'],
  flask: ['flask'],
  rails: ['rails'],
};

// First band whose `max` is >= the file count wins.
const SIZE_BANDS = [
  { max: 0, size: 'empty', loc: 'low' },
  { max: 20, size: 'small', loc: 'low' },
  { max: 200, size: 'medium', loc: 'moderate' },
  { max: Infinity, size: 'large', loc: 'high' },
];
const TEST_DIRS = ['tests', '__tests__', 'test'];
const MAX_DEPTH = 10;

function countFiles(directory, depth = 0, totals = { count: 0, deepestLevel: 0 }) {
  totals.deepestLevel = Math.max(totals.deepestLevel, depth);
  if (depth > MAX_DEPTH) return totals;
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.isFile()) totals.count += 1;
      else if (entry.isDirectory()) countFiles(path.join(directory, entry.name), depth + 1, totals);
    }
  } catch {}
  return totals;
}

function detectFrameworks(directory) {
  const pkg = readJsonSafe(path.join(directory, 'package.json')) || {};
  const allDependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  return Object.keys(FRAMEWORK_INDICATORS).filter((name) =>
    FRAMEWORK_INDICATORS[name].some((indicator) => indicator in allDependencies)
  );
}

function handleAssessTaskComplexity(_params, projectRoot) {
  const exists = (name) => fs.existsSync(path.join(projectRoot, name));
  const { count: fileCount, deepestLevel } = countFiles(projectRoot);
  const sizeBand = SIZE_BANDS.find((band) => fileCount <= band.max);

  return {
    file_count: fileCount,
    directory_depth: deepestLevel,
    has_package_json: exists('package.json'),
    has_config_files: CONFIG_FILES.filter(exists),
    frameworks_detected: detectFrameworks(projectRoot),
    existing_test_infrastructure: TEST_DIRS.some(exists),
    lines_of_code_estimate: sizeBand.loc,
    repo_is_empty: fileCount === 0,
    repo_size_estimate: sizeBand.size,
  };
}

module.exports = {
  handleAssessTaskComplexity,
};
