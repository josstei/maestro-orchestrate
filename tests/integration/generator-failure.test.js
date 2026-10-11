const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  runGeneratorExpectFailure,
  withTempRepoCopy,
} = require('./helpers');

describe('generator failure handling', () => {
  it('fails the run when the manifest references a missing source file', () => {
    withTempRepoCopy('maestro-generator-missing-source-', (repoRoot) => {
      fs.writeFileSync(
        path.join(repoRoot, 'src/manifest.js'),
        "module.exports = [{ src: 'missing-source.md', transforms: [], runtimes: ['gemini'] }];\n",
        'utf8'
      );

      const result = runGeneratorExpectFailure([], { cwd: repoRoot });

      assert.equal(result.status, 1);
      assert.match(result.stderr, /ERROR: Source not found: missing-source\.md/);
    });
  });

  it('fails the run when a transform throws while processing a source file', () => {
    withTempRepoCopy('maestro-generator-transform-error-', (repoRoot) => {
      fs.writeFileSync(
        path.join(repoRoot, 'src/agents/broken-transform.md'),
        [
          '---',
          'name: broken-transform',
          'capabilities: read_only',
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
