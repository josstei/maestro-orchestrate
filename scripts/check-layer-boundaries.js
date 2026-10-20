#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function collectJsFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * Checks every .js file under `libDir` (recursively) for a require() that is
 * neither a `node:` builtin nor a relative path resolving inside `libDir`.
 *
 * @param {string} libDir - Absolute path of the lib directory
 * @returns {{ files: string[], violations: string[] }} The scanned files and
 *   one message per violation, naming paths relative to the working directory
 */
function findLayerViolations(libDir) {
  const files = collectJsFiles(libDir);
  const violations = [];

  for (const file of files) {
    const relativeFile = path.relative(process.cwd(), file);

    for (const [, modPath] of fs.readFileSync(file, 'utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (modPath.startsWith('node:')) {
        continue;
      }

      if (!modPath.startsWith('.')) {
        violations.push(`${relativeFile}: require('${modPath}') — non-relative, non-node import`);
        continue;
      }

      const resolved = path.resolve(path.dirname(file), modPath);
      if (resolved !== libDir && !resolved.startsWith(libDir + path.sep)) {
        violations.push(`${relativeFile}: require('${modPath}') — resolves to ${path.relative(process.cwd(), resolved)}`);
      }
    }
  }

  return { files, violations };
}

if (require.main === module) {
  const { files, violations } = findLayerViolations(path.resolve(__dirname, '..', 'src', 'lib'));

  if (violations.length > 0) {
    console.error('Layer boundary violations in src/lib/:');
    for (const violation of violations) {
      console.error(`  ${violation}`);
    }
    process.exit(1);
  } else {
    console.log(`Layer boundaries clean: ${files.length} files scanned, 0 violations.`);
  }
}

module.exports = {
  findLayerViolations,
};
