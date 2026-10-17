const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runGenerator, withTempRepoCopy } = require('./helpers');

describe('generator read-only modes', () => {
  it('--dry-run and --diff do not rewrite registry files even when registry content would change', () => {
    withTempRepoCopy('maestro-generator-read-only-', (repoRoot) => {
      const registryPath = path.join(repoRoot, 'src/generated/agent-registry.json');
      const before = fs.readFileSync(registryPath, 'utf8');

      for (const flag of ['--dry-run', '--diff']) {
        const agentName = `registry-${flag.slice(2)}-test`;
        fs.writeFileSync(
          path.join(repoRoot, `src/agents/${agentName}.md`),
          `---\nname: ${agentName}\ncapabilities: read_only\n---\nBody\n`,
          'utf8'
        );

        runGenerator([flag], { cwd: repoRoot });

        assert.equal(
          fs.readFileSync(registryPath, 'utf8'),
          before,
          `Expected ${flag} to leave src/generated/agent-registry.json unchanged`
        );
      }
    });
  });
});
