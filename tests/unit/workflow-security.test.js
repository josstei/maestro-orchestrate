'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOWS_DIR = path.resolve(__dirname, '..', '..', '.github', 'workflows');
const WORKFLOW_FILES = [
  'generator-check.yml',
  'nightly.yml',
  'prepare-release.yml',
  'preview.yml',
  'rc.yml',
  'release.yml',
];

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
});
