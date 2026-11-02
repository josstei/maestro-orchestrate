'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('../support/paths');

const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows');
const readWorkflow = (fileName) => fs.readFileSync(path.join(WORKFLOWS_DIR, fileName), 'utf8');

/** The text of every `run:` step: a block scalar's more-indented lines, or an inline value. */
function collectRunBlocks(content) {
  const lines = content.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    // Any block scalar: |, |-, |+, >, >-, >+ (optionally with an indent digit).
    const block = lines[index].match(/^(\s*)run:\s*[|>][-+0-9]*\s*$/);
    const inline = lines[index].match(/^\s*run:\s*(.+?)\s*$/);
    if (!block) {
      if (inline) blocks.push(inline[1]);
      continue;
    }
    const inBlock = (line) => line.trim() === '' || line.match(/^ */)[0].length > block[1].length;
    let end = index + 1;
    while (end < lines.length && inBlock(lines[end])) end += 1;
    blocks.push(lines.slice(index + 1, end).join('\n'));
    index = end - 1;
  }
  return blocks;
}

const RUN_BLOCKS = fs
  .readdirSync(WORKFLOWS_DIR)
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .sort()
  .map((fileName) => [fileName, collectRunBlocks(readWorkflow(fileName))]);

describe('workflow shell security', () => {
  it('does not interpolate GitHub expressions directly inside run blocks', () => {
    for (const [fileName, runBlocks] of RUN_BLOCKS) {
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
    for (const [fileName, runBlocks] of RUN_BLOCKS) {
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

  it('stable release publishing uses npm token auth and manual recovery inputs', () => {
    const content = readWorkflow('release.yml');

    assert.match(content, /workflow_dispatch:/);
    assert.match(content, /\n\s+version:\n\s+description: 'Stable version to recover/);
    assert.match(content, /\n\s+target_sha:\n\s+description: 'Commit SHA to release/);
    assert.match(content, /NPM_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/);
    assert.match(content, /NODE_AUTH_TOKEN: \$\{\{ env\.NPM_TOKEN \}\}/);
    assert.match(content, /NPM_TOKEN is required for stable release publishing/);
    assert.match(content, /git rev-parse --verify --quiet "\$TAG\^\{commit\}"/);
    assert.match(content, /git rev-parse --verify --quiet "\$VERSION\^\{commit\}"/);
    assert.match(content, /Manual release recovery requires existing tag \$TAG/);
    assert.match(content, /Tag \$TAG exists at \$TAG_SHA, not target commit \$TARGET_SHA/);
  });

  it('prerelease workflows regenerate metadata and verify pack after npm versioning', () => {
    for (const [tag, versionVariable] of [['nightly', 'NIGHTLY'], ['preview', 'PREVIEW'], ['rc', 'RC_VERSION']]) {
      const fileName = `${tag}.yml`;
      const content = readWorkflow(fileName);
      const versionIndex = content.indexOf(`npm version "$${versionVariable}" --no-git-tag-version`);
      const generateIndex = content.indexOf('run: node scripts/generate.js\n', versionIndex);
      const verifyIndex = content.indexOf('run: npm run pack:verify', generateIndex);
      const publishIndex = content.indexOf(
        `node scripts/npm-publish-idempotent.js --tag ${tag} --access public`,
        verifyIndex
      );

      assert.notEqual(versionIndex, -1, `${fileName} should compute a prerelease npm version`);
      assert.notEqual(generateIndex, -1, `${fileName} should regenerate after npm version`);
      assert.notEqual(verifyIndex, -1, `${fileName} should verify npm pack after regenerating`);
      assert.notEqual(publishIndex, -1, `${fileName} should publish through the helper after verification`);
      assert.doesNotMatch(
        content,
        /npm-publish-idempotent\.js(?:[^\n]*\s)?--tag latest/,
        `${fileName} must not publish prereleases with the latest dist-tag`
      );
    }
  });
});
