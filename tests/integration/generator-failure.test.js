const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  createTempRepoCopy,
  runGeneratorExpectFailure,
} = require('./helpers');

describe('generator failure handling', () => {
  it('fails the run when the manifest references a missing source file', () => {
    const repoRoot = createTempRepoCopy('maestro-generator-missing-source-');

    try {
      fs.writeFileSync(
        path.join(repoRoot, 'src/manifest.js'),
        "module.exports = [{ src: 'missing-source.md', transforms: [], runtimes: ['gemini'] }];\n",
        'utf8'
      );

      const result = runGeneratorExpectFailure([], { cwd: repoRoot });

      assert.equal(result.status, 1);
      assert.match(result.stderr, /ERROR: Source not found: missing-source\.md/);
    } finally {
      fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
    }
  });

  it('fails the run when a transform throws while processing a source file', () => {
    const repoRoot = createTempRepoCopy('maestro-generator-transform-error-');

    try {
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
    } finally {
      fs.rmSync(path.dirname(repoRoot), { recursive: true, force: true });
    }
  });
});
