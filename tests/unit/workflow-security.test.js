'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('../support/paths');

const GITHUB_DIR = path.join(ROOT, '.github');
const PUBLISH_ACTION = 'actions/publish-prerelease/action.yml';
const WORKFLOW_FILES = fs
  .readdirSync(path.join(GITHUB_DIR, 'workflows'))
  .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
  .map((name) => `workflows/${name}`)
  .sort();
const ACTION_FILES = fs
  .readdirSync(path.join(GITHUB_DIR, 'actions'), { recursive: true })
  .filter((name) => ['action.yml', 'action.yaml'].includes(path.basename(name)))
  .map((name) => `actions/${name.split(path.sep).join('/')}`)
  .sort();
const SHELL_FILES = [...WORKFLOW_FILES, ...ACTION_FILES];

function readGithubFile(relativePath) {
  return fs.readFileSync(path.join(GITHUB_DIR, relativePath), 'utf8');
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
    // Any block scalar: |, |-, |+, >, >-, >+ (optionally with an indent digit).
    const blockMatch = line.match(/^(\s*)run:\s*[|>][-+0-9]*\s*$/);

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

function collectSteps(content) {
  const steps = [];

  for (const line of content.split('\n')) {
    if (/^\s*- (?:name|uses):/.test(line)) {
      steps.push([]);
    }
    if (steps.length > 0) {
      steps[steps.length - 1].push(line);
    }
  }

  return steps.map((lines) => lines.join('\n'));
}

describe('workflow shell security', () => {
  it('does not interpolate GitHub expressions directly inside run blocks', () => {
    assert.ok(ACTION_FILES.includes(PUBLISH_ACTION), `${PUBLISH_ACTION} should be scanned`);
    for (const fileName of SHELL_FILES) {
      const content = readGithubFile(fileName);
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
    for (const fileName of SHELL_FILES) {
      const content = readGithubFile(fileName);
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
      readGithubFile('workflows/release.yml'),
      /node scripts\/npm-publish-idempotent\.js --access public/
    );
  });

  it('stable release publishing uses npm token auth and manual recovery inputs', () => {
    const content = readGithubFile('workflows/release.yml');

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

  it('nightly regenerates metadata and verifies pack after npm versioning', () => {
    const content = readGithubFile('workflows/nightly.yml');
    const versionIndex = content.indexOf('npm version "$NIGHTLY" --no-git-tag-version');
    const generateIndex = content.indexOf('run: node scripts/generate.js\n', versionIndex);
    const verifyIndex = content.indexOf('run: npm run pack:verify', generateIndex);
    const publishIndex = content.indexOf(
      'node scripts/npm-publish-idempotent.js --tag nightly --access public',
      verifyIndex
    );

    assert.notEqual(versionIndex, -1, 'nightly.yml should compute a prerelease npm version');
    assert.notEqual(generateIndex, -1, 'nightly.yml should regenerate after npm version');
    assert.notEqual(verifyIndex, -1, 'nightly.yml should verify npm pack after regenerating');
    assert.notEqual(publishIndex, -1, 'nightly.yml should publish through the helper after verification');
    assert.doesNotMatch(
      content,
      /npm-publish-idempotent\.js(?:[^\n]*\s)?--tag latest/,
      'nightly.yml must not publish prereleases with the latest dist-tag'
    );
  });

  it('the publish-prerelease action versions, regenerates, verifies, publishes, then comments', () => {
    const steps = collectSteps(readGithubFile(PUBLISH_ACTION));
    const expectations = [
      { command: /run: npm version "\$VERSION" --no-git-tag-version$/m, env: 'VERSION: ${{ inputs.version }}' },
      { command: /run: node scripts\/generate\.js$/m },
      { command: /run: npm run pack:verify$/m },
      {
        command: /run: node scripts\/npm-publish-idempotent\.js --tag "\$TAG" --access public$/m,
        env: 'TAG: ${{ inputs.tag }}',
      },
      {
        command: /startswith\(env\.COMMENT_PREFIX\)/,
        env: 'COMMENT_PREFIX: ${{ inputs.comment-prefix }}',
      },
    ];

    let previousIndex = -1;
    for (const { command, env } of expectations) {
      const index = steps.findIndex((step) => command.test(step));
      assert.ok(index > previousIndex, `${PUBLISH_ACTION} should run ${command} after the previous step`);
      if (env) {
        assert.ok(steps[index].includes(env), `${PUBLISH_ACTION} should pass ${env} to ${command}`);
      }
      previousIndex = index;
    }
  });

  it('prerelease workflows publish through the action with their own dist-tag and gate', () => {
    const expectations = [
      { fileName: 'workflows/preview.yml', versionStepId: 'preview', tag: 'preview' },
      { fileName: 'workflows/rc.yml', versionStepId: 'rc', tag: 'rc' },
    ];

    for (const { fileName, versionStepId, tag } of expectations) {
      const content = readGithubFile(fileName);
      const steps = collectSteps(content);
      const versionIndex = steps.findIndex((step) => step.includes(`id: ${versionStepId}\n`));
      const publishIndex = steps.findIndex((step) => step.includes('uses: ./.github/actions/publish-prerelease\n'));
      const publishStep = steps[publishIndex] || '';

      assert.match(content, /\npermissions:\n {2}contents: read\n {2}pull-requests: write\n/, fileName);
      assert.match(content, /\n {6}NPM_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}\n/, fileName);
      assert.ok(versionIndex !== -1 && versionIndex < publishIndex, `${fileName} should compute the version first`);
      assert.match(steps[versionIndex], /if: env\.NPM_TOKEN != ''/, fileName);
      assert.match(publishStep, /if: env\.NPM_TOKEN != ''/, fileName);
      assert.ok(publishStep.includes(`version: \${{ steps.${versionStepId}.outputs.version }}`), fileName);
      assert.ok(publishStep.includes(`\n          tag: ${tag}\n`), `${fileName} should publish with --tag ${tag}`);
      assert.ok(publishStep.includes('NODE_AUTH_TOKEN: ${{ env.NPM_TOKEN }}'), fileName);
      for (const block of collectRunBlocks(content)) {
        assert.doesNotMatch(
          block,
          /npm version|npm-publish-idempotent/,
          `${fileName} should leave versioning and publishing to the action:\n${block}`
        );
      }
    }
  });
});
