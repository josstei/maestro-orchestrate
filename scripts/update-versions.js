#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { runCli } = require('./lib/cli');

const STABLE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
const BADGE_FILES = [
  'README.md',
  'claude/README.md',
];

function requireFile(root, relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${relativePath}`);
  }

  return filePath;
}

function updatePackageVersion(filePath, version) {
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  content.version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function updateBadge(filePath, version) {
  const content = fs.readFileSync(filePath, 'utf8');
  const updated = content.replace(
    /version-[0-9A-Za-z.-]+-blue/g,
    `version-${version}-blue`
  );

  fs.writeFileSync(filePath, updated, 'utf8');
}

function trimBlankEdges(lines) {
  const isContent = (line) => line.trim() !== '';
  const start = lines.findIndex(isContent);
  return start === -1 ? [] : lines.slice(start, lines.findLastIndex(isContent) + 1);
}

function updateChangelog(filePath, version, dateString = new Date().toISOString().slice(0, 10)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
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

  const nextVersionSection = [
    `## [${version}] - ${dateString}`,
    '',
    ...unreleasedLines,
  ];

  const updatedLines = [
    ...lines.slice(0, unreleasedIndex),
    '## [Unreleased]',
    '',
    ...nextVersionSection,
    '',
    ...lines.slice(nextSectionIndex),
  ];

  fs.writeFileSync(filePath, `${updatedLines.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
}

function updateVersions(version, options = {}) {
  const root = options.root || path.resolve(__dirname, '..');

  if (!STABLE_SEMVER_RE.test(version)) {
    throw new Error(`Invalid semver version: "${version}"`);
  }

  updatePackageVersion(requireFile(root, 'package.json'), version);

  for (const relativePath of BADGE_FILES) {
    updateBadge(requireFile(root, relativePath), version);
  }

  updateChangelog(requireFile(root, 'CHANGELOG.md'), version, options.dateString);

  return { version };
}

if (require.main === module) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node scripts/update-versions.js <version>');
    process.exit(1);
  }

  runCli('version update failed', () => {
    updateVersions(version);
    console.log(`Updated canonical release inputs to ${version}`);
  });
}

module.exports = {
  updateVersions,
};
