'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { writeTree } = require('../support/fs');
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
          `---\nname: ${agentName}\n---\nBody\n`,
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

describe('generator pruning', () => {
  it('prunes stale files from every directory it generates stubs, skills and commands into, and nowhere else', () => {
    withTempRepoCopy('maestro-generator-prune-', (repoRoot) => {
      const stale = [
        'agents/stale_agent.md',
        'antigravity/agents/stale-agent.md',
        'antigravity/skills/stale-skill/SKILL.md',
        'claude/agents/stale-agent.md',
        'claude/skills/stale-skill/SKILL.md',
        'plugins/maestro/skills/stale-skill/SKILL.md',
        'commands/maestro/stale-command.toml',
      ];
      // Hand-maintained runtime files sit beside the generated ones.
      const handMaintained = 'claude/scripts/hand-maintained.js';
      for (const file of [...stale, handMaintained]) {
        writeTree(repoRoot, file, 'stale');
      }

      const stdout = runGenerator([], { cwd: repoRoot });

      for (const file of stale) {
        assert.equal(fs.existsSync(path.join(repoRoot, file)), false, file);
        assert.ok(stdout.includes(`  PRUNED: ${file}\n`), `Expected a PRUNED line for ${file}`);
      }
      assert.equal(fs.readFileSync(path.join(repoRoot, handMaintained), 'utf8'), 'stale');
    });
  });
});
