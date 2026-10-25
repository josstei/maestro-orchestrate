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

function countFiles(directory, depth, depthLimit) {
  if (depth > depthLimit) {
    return { count: 0, deepestLevel: depth };
  }

  let count = 0;
  let deepestLevel = depth;

  try {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      if (entry.isFile()) {
        count += 1;
        continue;
      }

      if (entry.isDirectory()) {
        const nested = countFiles(
          path.join(directory, entry.name),
          depth + 1,
          depthLimit
        );
        count += nested.count;
        deepestLevel = Math.max(deepestLevel, nested.deepestLevel);
      }
    }
  } catch {}

  return { count, deepestLevel };
}

function detectFrameworks(directory) {
  const pkg = readJsonSafe(path.join(directory, 'package.json'));
  if (!pkg) {
    return [];
  }

  const allDependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  return Object.entries(FRAMEWORK_INDICATORS)
    .filter(([, indicators]) =>
      indicators.some((indicator) => indicator in allDependencies)
    )
    .map(([name]) => name);
}

function handleAssessTaskComplexity(_params, projectRoot) {
  const { count: fileCount, deepestLevel } = countFiles(projectRoot, 0, 10);
  const configFiles = CONFIG_FILES.filter((file) =>
    fs.existsSync(path.join(projectRoot, file))
  );
  const sizeBand = SIZE_BANDS.find((band) => fileCount <= band.max);

  return {
    file_count: fileCount,
    directory_depth: deepestLevel,
    has_package_json: fs.existsSync(path.join(projectRoot, 'package.json')),
    has_config_files: configFiles,
    frameworks_detected: detectFrameworks(projectRoot),
    existing_test_infrastructure: TEST_DIRS.some((dir) =>
      fs.existsSync(path.join(projectRoot, dir))
    ),
    lines_of_code_estimate: sizeBand.loc,
    repo_is_empty: fileCount === 0,
    repo_size_estimate: sizeBand.size,
  };
}

module.exports = {
  handleAssessTaskComplexity,
};
