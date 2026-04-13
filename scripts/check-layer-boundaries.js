#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LIB_DIR = path.resolve(__dirname, '..', 'src', 'lib');

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

function scanFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
  const violations = [];
  let match;

  while ((match = requirePattern.exec(content)) !== null) {
    const modPath = match[1];

    if (modPath.startsWith('node:')) {
      continue;
    }

    if (modPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filepath), modPath);
      if (!resolved.startsWith(LIB_DIR)) {
        violations.push({
          file: path.relative(process.cwd(), filepath),
          import: modPath,
          resolved: path.relative(process.cwd(), resolved),
        });
      }
      continue;
    }

    violations.push({
      file: path.relative(process.cwd(), filepath),
      import: modPath,
      reason: 'non-relative, non-node import',
    });
  }

  return violations;
}

const files = collectJsFiles(LIB_DIR);
const allViolations = [];

for (const file of files) {
  allViolations.push(...scanFile(file));
}

if (allViolations.length > 0) {
  console.error('Layer boundary violations in src/lib/:');
  for (const v of allViolations) {
    const detail = v.reason || `resolves to ${v.resolved}`;
    console.error(`  ${v.file}: require('${v.import}') — ${detail}`);
  }
  process.exit(1);
} else {
  console.log(`Layer boundaries clean: ${files.length} files scanned, 0 violations.`);
}
