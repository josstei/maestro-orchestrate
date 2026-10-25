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
  it('fails before writing when a stub renderer throws or a required content source is missing', () => {
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

      const generated = path.join(repoRoot, 'claude/agents/coder.md');
      fs.writeFileSync(generated, 'must not be cleaned or replaced\n');
      const transformFailure = runGeneratorExpectFailure(['--clean'], { cwd: repoRoot });

      assert.equal(transformFailure.status, 1);
      assert.match(transformFailure.stderr, /ERROR: processing agents\/broken-transform\.md -> claude\/agents\/broken-transform\.md: Unclosed <example> tag in agent body/);
      assert.equal(fs.readFileSync(generated, 'utf8'), 'must not be cleaned or replaced\n');

      fs.unlinkSync(path.join(repoRoot, 'src/agents/broken-transform.md'));
      fs.unlinkSync(path.join(repoRoot, 'src/agents/shared/handoff-report.md'));

      const missingSourceFailure = runGeneratorExpectFailure(['--clean'], { cwd: repoRoot });

      assert.equal(missingSourceFailure.status, 1);
      assert.match(missingSourceFailure.stderr, /Generator failed: ENOENT.*handoff-report\.md/);
      assert.equal(fs.readFileSync(generated, 'utf8'), 'must not be cleaned or replaced\n');
    });
  });
});
