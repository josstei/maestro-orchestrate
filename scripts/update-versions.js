#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const JSON_VERSION_FILES = [
  'package.json',
  'gemini-extension.json',
  'qwen-extension.json',
  'claude/.claude-plugin/plugin.json',
  'plugins/maestro/.codex-plugin/plugin.json',
];
const BADGE_FILES = [
  'README.md',
  'claude/README.md',
];
const MARKETPLACE_PATH = '.claude-plugin/marketplace.json';
const CODEX_MCP_PATH = 'plugins/maestro/.mcp.json';
const CHANGELOG_PATH = 'CHANGELOG.md';
const PACKAGE_NAME = '@maestro-orchestrator/maestro';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function requireFile(root, relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${relativePath}`);
  }

  return filePath;
}

function updateJsonVersion(filePath, version) {
  const content = readJson(filePath);
  content.version = version;
  writeJson(filePath, content);
}

function updateMarketplace(filePath, version) {
  const content = readJson(filePath);

  if (content.metadata && typeof content.metadata === 'object') {
    content.metadata.version = version;
  }

  if (Array.isArray(content.plugins)) {
    for (const plugin of content.plugins) {
      if (plugin && typeof plugin === 'object') {
        plugin.version = version;
      }
    }
  }

  writeJson(filePath, content);
}

function updateCodexMcpPackage(filePath, version) {
  const content = readJson(filePath);
  const server = content.mcpServers && content.mcpServers.maestro;

  if (!server || !Array.isArray(server.args)) {
    throw new Error('plugins/maestro/.mcp.json missing mcpServers.maestro.args');
  }

  const packageFlagIndex = server.args.indexOf('-p');
  if (packageFlagIndex === -1 || packageFlagIndex === server.args.length - 1) {
    throw new Error('plugins/maestro/.mcp.json must launch npx with -p <package>');
  }

  server.args[packageFlagIndex + 1] = `${PACKAGE_NAME}@${version}`;
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

function updateVersions(version, options = {}) {
  const root = options.root || path.resolve(__dirname, '..');

  if (!SEMVER_RE.test(version)) {
    throw new Error(`Invalid semver version: "${version}"`);
  }

  for (const relativePath of JSON_VERSION_FILES) {
    updateJsonVersion(requireFile(root, relativePath), version);
  }

  updateMarketplace(requireFile(root, MARKETPLACE_PATH), version);
  updateCodexMcpPackage(requireFile(root, CODEX_MCP_PATH), version);

  for (const relativePath of BADGE_FILES) {
    updateBadge(requireFile(root, relativePath), version);
  }

  updateChangelog(requireFile(root, CHANGELOG_PATH), version, options.dateString);
}

if (require.main === module) {
  const version = process.argv[2];

  if (!version) {
    console.error('Usage: node scripts/update-versions.js <version>');
    process.exit(1);
  }

  updateVersions(version);
  console.log(`Updated all version locations to ${version}`);
}

module.exports = {
  updateChangelog,
  updateCodexMcpPackage,
  updateVersions,
};
