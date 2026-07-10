#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { moduleDirname } from '../core/module-path.js';
import { resolvePackageRoot } from '../core/package-root.js';
const ROOT = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });

type ImportViolation = {
  file: string;
  specifier: string;
  reason: string;
};

function listSourceFiles(): string[] {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '*.js', '*.ts'],
    { cwd: ROOT, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .filter((file) => (file.endsWith('.js') || file.endsWith('.ts')) && fs.existsSync(path.join(ROOT, file)));
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/**');
}

function scanFile(relativePath: string): ImportViolation[] {
  const lines = fs.readFileSync(path.join(ROOT, relativePath), 'utf8').split('\n');
  const specifierPattern = /(?:from|import)\b\s*\(?\s*['"]([^'"]+)['"]/g;
  const violations: ImportViolation[] = [];

  for (const line of lines) {
    if (isCommentLine(line)) {
      continue;
    }

    let match;
    specifierPattern.lastIndex = 0;
    while ((match = specifierPattern.exec(line)) !== null) {
      const specifier = match[1];
      if (!specifier) {
        continue;
      }

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

const allViolations = listSourceFiles().flatMap(scanFile);

if (allViolations.length > 0) {
  console.error('ESM import specifier violations:');
  for (const v of allViolations) {
    console.error(`  ${v.file}: '${v.specifier}' — ${v.reason}`);
  }
  process.exit(1);
} else {
  console.log('ESM import specifiers clean.');
}
