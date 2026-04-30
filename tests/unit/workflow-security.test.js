'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', '.github', 'workflows');
const WORKFLOW_FILES = fs
  .readdirSync(WORKFLOWS_DIR)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort();

function readWorkflow(fileName) {
  return fs.readFileSync(path.join(WORKFLOWS_DIR, fileName), 'utf8');
}

function getIndent(line) {
  const match = line.match(/^ */);
  return match ? match[0].length : 0;
}

function collectRunBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const blockMatch = line.match(/^(\s*)run:\s*\|\s*$/);

    if (blockMatch) {
      const runIndent = blockMatch[1].length;
      const blockLines = [];
      let cursor = index + 1;

      while (cursor < lines.length) {
        const nextLine = lines[cursor];
        if (nextLine.trim() !== '' && getIndent(nextLine) <= runIndent) {
          break;
        }
        blockLines.push(nextLine);
        cursor += 1;
      }

      blocks.push(blockLines.join('\n'));
      index = cursor - 1;
      continue;
    }

    const inlineMatch = line.match(/^\s*run:\s*(.+?)\s*$/);
    if (inlineMatch) {
      blocks.push(inlineMatch[1]);
    }
  }

  return blocks;
}

describe('workflow shell security', () => {
  it('does not interpolate GitHub expressions directly inside run blocks', () => {
    for (const fileName of WORKFLOW_FILES) {
      const filePath = path.join(WORKFLOWS_DIR, fileName);
      const content = fs.readFileSync(filePath, 'utf8');
      const runBlocks = collectRunBlocks(content);

      assert.ok(runBlocks.length > 0, `${fileName} should contain at least one run block`);
      for (const block of runBlocks) {
        assert.doesNotMatch(
          block,
          /\$\{\{/,
          `${fileName} contains a raw GitHub expression inside a run block:\n${block}`
        );
      }
    }
  });

  it('publishing workflows use the idempotent npm publish helper', () => {
    for (const fileName of WORKFLOW_FILES) {
      const content = readWorkflow(fileName);
      const runBlocks = collectRunBlocks(content);

      for (const block of runBlocks) {
        assert.doesNotMatch(
          block,
          /(^|\n)\s*npm publish\b/,
          `${fileName} contains a raw npm publish command:\n${block}`
        );
      }
    }

    assert.match(
      readWorkflow('release.yml'),
      /node scripts\/npm-publish-idempotent\.js --access public/
    );
  });

  it('prerelease workflows regenerate metadata and verify pack after npm versioning', () => {
    const expectations = [
      {
        fileName: 'nightly.yml',
        versionCommand: 'npm version "$NIGHTLY" --no-git-tag-version',
        publishCommand: 'node scripts/npm-publish-idempotent.js --tag nightly --access public',
      },
      {
        fileName: 'preview.yml',
        versionCommand: 'npm version "$PREVIEW" --no-git-tag-version',
        publishCommand: 'node scripts/npm-publish-idempotent.js --tag preview --access public',
      },
      {
        fileName: 'rc.yml',
        versionCommand: 'npm version "$RC_VERSION" --no-git-tag-version',
        publishCommand: 'node scripts/npm-publish-idempotent.js --tag rc --access public',
      },
    ];

    for (const { fileName, versionCommand, publishCommand } of expectations) {
      const content = readWorkflow(fileName);
      const versionIndex = content.indexOf(versionCommand);
      const generateIndex = content.indexOf('run: node scripts/generate.js', versionIndex);
      const verifyIndex = content.indexOf('run: npm run pack:verify', generateIndex);
      const publishIndex = content.indexOf(publishCommand, verifyIndex);

      assert.notEqual(versionIndex, -1, `${fileName} should compute a prerelease npm version`);
      assert.notEqual(generateIndex, -1, `${fileName} should regenerate after npm version`);
      assert.notEqual(verifyIndex, -1, `${fileName} should verify npm pack after regenerating`);
      assert.notEqual(publishIndex, -1, `${fileName} should publish through the helper after verification`);
    }
  });
});
