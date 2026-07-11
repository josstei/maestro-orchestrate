import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createTempRepoCopy, runGeneratorExpectFailure } from './helpers.js';

describe('generator failure handling', () => {
  it('fails the run when the manifest references a missing source file', () => {
    const repoRoot = createTempRepoCopy('maestro-generator-missing-source-');

    try {
      fs.writeFileSync(
        path.join(repoRoot, 'dist/src/manifest.js'),
        "export default [{ src: 'missing-source.md', transforms: [], runtimes: ['gemini'] }];\n",
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
