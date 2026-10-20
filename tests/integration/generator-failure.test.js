'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  runGeneratorExpectFailure,
  withTempRepoCopy,
} = require('./helpers');

describe('generator failure handling', () => {
  it('fails the run when a transform throws or the manifest references a missing source file', () => {
    withTempRepoCopy('maestro-generator-failure-', (repoRoot) => {
      fs.writeFileSync(
        path.join(repoRoot, 'src/agents/broken-transform.md'),
        [
          '---',
          'name: broken-transform',
          '---',
          '<example>',
          'Missing closing example tag',
          '',
        ].join('\n'),
        'utf8'
      );

      const transformFailure = runGeneratorExpectFailure([], { cwd: repoRoot });

      assert.equal(transformFailure.status, 1);
      assert.match(transformFailure.stderr, /ERROR: processing agents\/broken-transform\.md -> claude\/agents\/broken-transform\.md: Unclosed <example> tag in agent body/);

      // The manifest override no longer globs src/agents, so the broken agent above is not processed again.
      fs.writeFileSync(
        path.join(repoRoot, 'src/generator/manifest.js'),
        "module.exports = [{ src: 'missing-source.md', transforms: [], runtimes: ['qwen'] }];\n",
        'utf8'
      );

      const missingSourceFailure = runGeneratorExpectFailure([], { cwd: repoRoot });

      assert.equal(missingSourceFailure.status, 1);
      assert.match(missingSourceFailure.stderr, /ERROR: Source not found: missing-source\.md/);
    });
  });
});
