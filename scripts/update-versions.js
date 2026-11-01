#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseFlagArgs, runCli } = require('./lib/cli');

const STABLE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
const BADGE_FILES = [
  'README.md',
  'claude/README.md',
];

function trimBlankEdges(lines) {
  const isContent = (line) => line.trim() !== '';
  const start = lines.findIndex(isContent);
  return start === -1 ? [] : lines.slice(start, lines.findLastIndex(isContent) + 1);
}

function releaseChangelog(content, version, dateString = new Date().toISOString().slice(0, 10)) {
  const lines = content.split('\n');
  const unreleasedIndex = lines.findIndex((line) => line.trim() === '## [Unreleased]');

  if (unreleasedIndex === -1) {
    throw new Error('CHANGELOG.md missing ## [Unreleased] section');
  }

  const nextIndex = lines.findIndex((line, index) => index > unreleasedIndex && line.startsWith('## ['));
  const nextSectionIndex = nextIndex === -1 ? lines.length : nextIndex;

  const unreleasedLines = trimBlankEdges(lines.slice(unreleasedIndex + 1, nextSectionIndex));
  if (unreleasedLines.length === 0) {
    throw new Error('CHANGELOG [Unreleased] section has no content');
  }

  const updatedLines = [
    ...lines.slice(0, unreleasedIndex),
    '## [Unreleased]',
    '',
    `## [${version}] - ${dateString}`,
    '',
    ...unreleasedLines,
    '',
    ...lines.slice(nextSectionIndex),
  ];

  return `${updatedLines.join('\n').replace(/\n+$/, '')}\n`;
}

function updateVersions(version, options = {}) {
  const root = options.root || path.resolve(__dirname, '..');

  if (!STABLE_SEMVER_RE.test(version)) {
    throw new Error(`Invalid semver version: "${version}"`);
  }

  const rewrite = (relativePath, transform) => {
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Required file not found: ${relativePath}`);
    }
    fs.writeFileSync(filePath, transform(fs.readFileSync(filePath, 'utf8')), 'utf8');
  };

  rewrite('package.json', (content) => `${JSON.stringify(Object.assign(JSON.parse(content), { version }), null, 2)}\n`);
  for (const relativePath of BADGE_FILES) {
    rewrite(relativePath, (content) => content.replace(/version-[0-9A-Za-z.-]+-blue/g, `version-${version}-blue`));
  }
  rewrite('CHANGELOG.md', (content) => releaseChangelog(content, version, options.dateString));

  return { version };
}

if (require.main === module) {
  runCli('version update failed', () => {
    const { positionals: [version] } = parseFlagArgs(process.argv.slice(2), {
      positional: 'version',
      printHelp: () => console.log('Usage: node scripts/update-versions.js <version>'),
    });
    if (!version) throw new Error('Missing <version> argument');

    updateVersions(version);
    console.log(`Updated canonical release inputs to ${version}`);
  });
}

module.exports = {
  updateVersions,
};
