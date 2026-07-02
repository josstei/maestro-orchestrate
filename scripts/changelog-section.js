#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runAsMain } = require('./lib/cli');

const CHANGELOG_PATH = path.resolve(__dirname, '..', 'CHANGELOG.md');

function extractChangelogSection(changelogPath, version) {
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

if (require.main === module) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node scripts/changelog-section.js <version>');
    process.exit(1);
  }

  runAsMain(module, 'changelog section', () => {
    process.stdout.write(`${extractChangelogSection(CHANGELOG_PATH, version)}\n`);
  });
}

module.exports = { extractChangelogSection };
