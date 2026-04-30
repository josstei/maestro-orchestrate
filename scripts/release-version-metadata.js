'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STABLE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
const PACKAGE_JSON_PATH = 'package.json';
const BADGE_FILES = [
  'README.md',
  'claude/README.md',
];
const CHANGELOG_PATH = 'CHANGELOG.md';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function requireFile(root, relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${relativePath}`);
  }

  return filePath;
}

function updatePackageVersion(filePath, version) {
  const content = readJson(filePath);
  content.version = version;
  writeJson(filePath, content);
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
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === '') {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === '') {
    end -= 1;
  }

  return lines.slice(start, end);
}

function updateChangelog(filePath, version, dateString = new Date().toISOString().slice(0, 10)) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const unreleasedIndex = lines.findIndex((line) => line.trim() === '## [Unreleased]');

  if (unreleasedIndex === -1) {
    throw new Error('CHANGELOG.md missing ## [Unreleased] section');
  }

  let nextSectionIndex = lines.length;
  for (let index = unreleasedIndex + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('## [')) {
      nextSectionIndex = index;
      break;
    }
  }

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

function updateReleaseInputs(version, options = {}) {
  const root = options.root || path.resolve(__dirname, '..');

  if (!STABLE_SEMVER_RE.test(version)) {
    throw new Error(`Invalid semver version: "${version}"`);
  }

  updatePackageVersion(requireFile(root, PACKAGE_JSON_PATH), version);

  for (const relativePath of BADGE_FILES) {
    updateBadge(requireFile(root, relativePath), version);
  }

  updateChangelog(requireFile(root, CHANGELOG_PATH), version, options.dateString);

  return { version };
}

module.exports = {
  BADGE_FILES,
  CHANGELOG_PATH,
  PACKAGE_JSON_PATH,
  STABLE_SEMVER_RE,
  trimBlankEdges,
  updateBadge,
  updateChangelog,
  updatePackageVersion,
  updateReleaseInputs,
};
