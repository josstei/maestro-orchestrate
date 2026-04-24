'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { CONFIG_FILES, SKIP_DIRS, FRAMEWORK_INDICATORS } = require('../../lib/framework-detection');

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
  const packagePath = path.join(directory, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return [];
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const allDependencies = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    return Object.entries(FRAMEWORK_INDICATORS)
      .filter(([, indicators]) =>
        indicators.some((indicator) => indicator in allDependencies)
      )
      .map(([name]) => name);
  } catch {
    return [];
  }
}

function estimateSize(fileCount) {
  if (fileCount === 0) {
    return 'empty';
  }

  if (fileCount <= 20) {
    return 'small';
  }

  if (fileCount <= 200) {
    return 'medium';
  }

  return 'large';
}

function handleAssessTaskComplexity(_params, projectRoot) {
  const { count: fileCount, deepestLevel } = countFiles(projectRoot, 0, 10);
  const configFiles = CONFIG_FILES.filter((file) =>
    fs.existsSync(path.join(projectRoot, file))
  );

  return {
    file_count: fileCount,
    directory_depth: deepestLevel,
    has_package_json: fs.existsSync(path.join(projectRoot, 'package.json')),
    has_config_files: configFiles,
    frameworks_detected: detectFrameworks(projectRoot),
    existing_test_infrastructure:
      fs.existsSync(path.join(projectRoot, 'tests')) ||
      fs.existsSync(path.join(projectRoot, '__tests__')) ||
      fs.existsSync(path.join(projectRoot, 'test')),
    lines_of_code_estimate:
      fileCount <= 20 ? 'low' : fileCount <= 200 ? 'moderate' : 'high',
    repo_is_empty: fileCount === 0,
    repo_size_estimate: estimateSize(fileCount),
  };
}

module.exports = {
  handleAssessTaskComplexity,
};
