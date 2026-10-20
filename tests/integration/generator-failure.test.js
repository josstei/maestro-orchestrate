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
  it('reports a failing transform and fails the run', () => {
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

      const result = runGeneratorExpectFailure([], { cwd: repoRoot });

      assert.equal(result.status, 1);
      assert.match(result.stderr, /ERROR: processing agents\/broken-transform\.md -> claude\/agents\/broken-transform\.md: Unclosed <example> tag in agent body/);
    });
  });
});
