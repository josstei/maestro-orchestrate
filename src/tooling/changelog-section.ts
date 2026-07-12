#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { moduleDirname } from '../core/package-root.js';
import { resolvePackageRoot } from '../core/package-root.js';
import { runAsMain } from './lib/cli.js';
const ROOT = resolvePackageRoot(moduleDirname(import.meta.url), { malformedJson: 'throw' });
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function extractChangelogSection(changelogPath: string, version: string): string {
  const header = `## [${version}]`;
  const lines = fs.readFileSync(changelogPath, 'utf8').split('\n');
  const sectionLines = [];
  let found = false;

  for (const line of lines) {
    if (!found) {
      if (line.startsWith(header)) found = true;
      continue;
    }
    if (line.startsWith('## [')) break;
    sectionLines.push(line);
  }

  if (!found) {
    throw new Error(`CHANGELOG.md missing section for ${header}`);
  }

  return sectionLines.join('\n');
}

const entrypoint = process.argv[1];

if (entrypoint && import.meta.url === pathToFileURL(fs.realpathSync(entrypoint)).href) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node dist/src/tooling/changelog-section.js <version>');
    process.exit(1);
  }

  runAsMain(import.meta.url, 'changelog section', () => {
    process.stdout.write(`${extractChangelogSection(CHANGELOG_PATH, version)}\n`);
  });
}

export { extractChangelogSection };
