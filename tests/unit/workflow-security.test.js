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
    let totalRunBlocks = 0;

    for (const fileName of WORKFLOW_FILES) {
      const filePath = path.join(WORKFLOWS_DIR, fileName);
      const content = fs.readFileSync(filePath, 'utf8');
      const runBlocks = collectRunBlocks(content);
      totalRunBlocks += runBlocks.length;

      for (const block of runBlocks) {
        assert.doesNotMatch(
          block,
          /\$\{\{/,
          `${fileName} contains a raw GitHub expression inside a run block:\n${block}`
        );
      }
    }

    assert.ok(totalRunBlocks > 0, 'workflow files should contain at least one run block overall');
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

  it('stable release publishes the generated dist branch and guards the release asset shape', () => {
    const content = readWorkflow('release.yml');
    const npmPublishIndex = content.indexOf('node scripts/npm-publish-idempotent.js --access public');
    const distBuildIndex = content.indexOf('node scripts/publish-dist-branch.js', npmPublishIndex);
    const distBranchPushIndex = content.indexOf(
      'git push --force origin "${DIST_SHA}:refs/heads/dist"',
      distBuildIndex
    );
    const distTagPushIndex = content.indexOf(
      'git push origin "${DIST_SHA}:refs/tags/${DIST_TAG}"',
      distBranchPushIndex
    );
    const assetGuardIndex = content.indexOf(
      "grep -Fxq './gemini-extension.json'",
      distTagPushIndex
    );
    const releaseCreationIndex = content.indexOf('name: Create GitHub Release', assetGuardIndex);

    assert.notEqual(npmPublishIndex, -1, 'release.yml should publish to npm before building the dist snapshot');
    assert.notEqual(distBuildIndex, -1, 'release.yml should build the dist snapshot via scripts/publish-dist-branch.js');
    assert.notEqual(distBranchPushIndex, -1, 'release.yml should force-push the snapshot SHA to refs/heads/dist');
    assert.notEqual(distTagPushIndex, -1, 'release.yml should push the snapshot SHA to a dist/v<version> tag');
    assert.notEqual(assetGuardIndex, -1, 'release.yml should assert gemini-extension.json sits at the release asset root');
    assert.notEqual(releaseCreationIndex, -1, 'release.yml should create the GitHub release only after the asset guard');
    assert.match(
      content,
      /ASSET="dist\/release\/maestro-v\$\{VERSION\}-extension\.tar\.gz"/,
      'release.yml asset guard should check the versioned extension tarball path'
    );
  });

  it('the reusable prerelease-publish workflow regenerates metadata and verifies pack after npm versioning', () => {
    const content = readWorkflow('prerelease-publish.yml');
    const versionIndex = content.indexOf('eval "$VERSION_COMMAND"');
    const generateIndex = content.indexOf('run: npm run generate', versionIndex);
    const verifyIndex = content.indexOf('run: npm run pack:verify', generateIndex);
    const publishIndex = content.indexOf(
      'node scripts/npm-publish-idempotent.js --tag "$DIST_TAG" --access public',
      verifyIndex
    );

    assert.notEqual(versionIndex, -1, 'prerelease-publish.yml should evaluate the caller-supplied version command');
    assert.notEqual(generateIndex, -1, 'prerelease-publish.yml should regenerate after setting the version');
    assert.notEqual(verifyIndex, -1, 'prerelease-publish.yml should verify npm pack after regenerating');
    assert.notEqual(publishIndex, -1, 'prerelease-publish.yml should publish through the helper after verification');
    assert.doesNotMatch(
      content,
      /npm-publish-idempotent\.js(?:[^\n]*\s)?--tag latest/,
      'prerelease-publish.yml must not publish prereleases with the latest dist-tag'
    );
  });

  it('nightly/preview/rc callers delegate to the reusable prerelease-publish workflow with the correct dist-tag', () => {
    const expectations = [
      {
        fileName: 'nightly.yml',
        distTag: 'nightly',
        versionCommand: 'npm version "$NIGHTLY" --no-git-tag-version',
      },
      {
        fileName: 'preview.yml',
        distTag: 'preview',
        versionCommand: 'npm version "$PREVIEW" --no-git-tag-version',
      },
      {
        fileName: 'rc.yml',
        distTag: 'rc',
        versionCommand: 'npm version "$RC_VERSION" --no-git-tag-version',
      },
    ];

    for (const { fileName, distTag, versionCommand } of expectations) {
      const content = readWorkflow(fileName);

      assert.match(
        content,
        /uses: \.\/\.github\/workflows\/prerelease-publish\.yml/,
        `${fileName} should call the reusable prerelease-publish workflow`
      );
      assert.match(
        content,
        new RegExp(`dist-tag: ${distTag}\\b`),
        `${fileName} should pass the ${distTag} dist-tag`
      );
      assert.ok(
        content.includes(versionCommand),
        `${fileName} should compute its prerelease version`
      );
      assert.doesNotMatch(
        content,
        /dist-tag:\s*latest\b/,
        `${fileName} must not publish prereleases with the latest dist-tag`
      );
    }
  });
});
