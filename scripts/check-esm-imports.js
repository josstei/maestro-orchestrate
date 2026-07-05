#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '..');

function listTrackedJsFiles() {
  return execFileSync('git', ['ls-files', '*.js'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/**');
}

function scanFile(relativePath) {
  const lines = fs.readFileSync(path.join(ROOT, relativePath), 'utf8').split('\n');
  const specifierPattern = /(?:from\s+|import\()\s*['"]([^'"]+)['"]/g;
  const violations = [];

  for (const line of lines) {
    if (isCommentLine(line)) {
      continue;
    }

    let match;
    specifierPattern.lastIndex = 0;
    while ((match = specifierPattern.exec(line)) !== null) {
      const specifier = match[1];

      if (specifier.startsWith('.')) {
        if (!specifier.endsWith('.js') && !specifier.endsWith('.json')) {
          violations.push({
            file: relativePath,
            specifier,
            reason: 'relative import must carry an explicit .js or .json specifier',
          });
        }
        continue;
      }

      if (specifier === '@modelcontextprotocol/sdk' || specifier.startsWith('@modelcontextprotocol/sdk/')) {
        if (specifier === '@modelcontextprotocol/sdk') {
          violations.push({
            file: relativePath,
            specifier,
            reason: 'must import a deep .js subpath, never the bare package root',
          });
        } else if (!specifier.endsWith('.js')) {
          violations.push({
            file: relativePath,
            specifier,
            reason: '@modelcontextprotocol/sdk subpath import must end in .js',
          });
        }
      }
    }
  }

  return violations;
}

const allViolations = listTrackedJsFiles().flatMap(scanFile);

if (allViolations.length > 0) {
  console.error('ESM import specifier violations:');
  for (const v of allViolations) {
    console.error(`  ${v.file}: '${v.specifier}' — ${v.reason}`);
  }
  process.exit(1);
} else {
  console.log('ESM import specifiers clean.');
}
