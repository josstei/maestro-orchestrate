'use strict';

const { afterEach, beforeEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { updateVersions } = require('../../scripts/update-versions');

function createTempProject(version) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-update-versions-'));
  const files = {
    'package.json': { name: '@maestro-orchestrator/maestro', version, license: 'Apache-2.0' },
    'gemini-extension.json': { name: 'maestro', version },
    'qwen-extension.json': { name: 'maestro', version },
    'claude/.claude-plugin/plugin.json': { name: 'maestro', version },
    'plugins/maestro/.codex-plugin/plugin.json': { name: 'maestro', version },
    'plugins/maestro/.mcp.json': {
      mcpServers: {
        maestro: {
          command: 'npx',
          args: ['-y', '-p', `@maestro-orchestrator/maestro@${version}`, 'maestro-mcp-server'],
        },
      },
    },
    '.claude-plugin/marketplace.json': {
      name: 'maestro-orchestrator',
      metadata: { version },
      plugins: [{ name: 'maestro', version }],
    },
    'README.md': `# Maestro\n\n[![Version](https://img.shields.io/badge/version-${version}-blue)](link)\n`,
    'claude/README.md': `# Claude\n\n[![Version](https://img.shields.io/badge/version-${version}-blue)](link)\n`,
    'CHANGELOG.md': [
      '# Changelog',
      '',
      '## [Unreleased]',
      '',
      '### Added',
      '',
      '- Something new',
      '',
      `## [${version}] - 2026-04-10`,
      '',
      '### Fixed',
      '',
      '- Old fix',
      '',
    ].join('\n'),
  };

  for (const [relativePath, value] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return root;
}

describe('updateVersions', () => {
  let tempRoot = null;

  beforeEach(() => {
    tempRoot = createTempProject('1.6.1');
  });

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = null;
    }
  });

  it('updates all JSON version fields to the new version', () => {
    updateVersions('1.7.0', { root: tempRoot, dateString: '2026-04-12' });

    const pkg = JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8'));
    const gemini = JSON.parse(fs.readFileSync(path.join(tempRoot, 'gemini-extension.json'), 'utf8'));
    const qwen = JSON.parse(fs.readFileSync(path.join(tempRoot, 'qwen-extension.json'), 'utf8'));
    const claudePlugin = JSON.parse(
      fs.readFileSync(path.join(tempRoot, 'claude/.claude-plugin/plugin.json'), 'utf8')
    );
    const codexPlugin = JSON.parse(
      fs.readFileSync(path.join(tempRoot, 'plugins/maestro/.codex-plugin/plugin.json'), 'utf8')
    );
    const codexMcp = JSON.parse(
      fs.readFileSync(path.join(tempRoot, 'plugins/maestro/.mcp.json'), 'utf8')
    );
    const marketplace = JSON.parse(
      fs.readFileSync(path.join(tempRoot, '.claude-plugin/marketplace.json'), 'utf8')
    );

    assert.equal(pkg.version, '1.7.0');
    assert.equal(gemini.version, '1.7.0');
    assert.equal(qwen.version, '1.7.0');
    assert.equal(claudePlugin.version, '1.7.0');
    assert.equal(codexPlugin.version, '1.7.0');
    assert.ok(codexMcp.mcpServers.maestro.args.includes('@maestro-orchestrator/maestro@1.7.0'));
    assert.equal(marketplace.metadata.version, '1.7.0');
    assert.equal(marketplace.plugins[0].version, '1.7.0');
  });

  it('updates version badges in both readmes', () => {
    updateVersions('1.7.0', { root: tempRoot, dateString: '2026-04-12' });

    const rootReadme = fs.readFileSync(path.join(tempRoot, 'README.md'), 'utf8');
    const claudeReadme = fs.readFileSync(path.join(tempRoot, 'claude/README.md'), 'utf8');

    assert.match(rootReadme, /version-1\.7\.0-blue/);
    assert.doesNotMatch(rootReadme, /version-1\.6\.1-blue/);
    assert.match(claudeReadme, /version-1\.7\.0-blue/);
    assert.doesNotMatch(claudeReadme, /version-1\.6\.1-blue/);
  });

  it('moves unreleased changelog content into the new version section', () => {
    updateVersions('1.7.0', { root: tempRoot, dateString: '2026-04-12' });

    const changelog = fs.readFileSync(path.join(tempRoot, 'CHANGELOG.md'), 'utf8');

    assert.match(changelog, /## \[Unreleased\]\n\n## \[1\.7\.0\] - 2026-04-12/);
    assert.match(changelog, /## \[1\.7\.0\] - 2026-04-12\n\n### Added\n\n- Something new/);
    assert.doesNotMatch(changelog, /## \[Unreleased\]\n\n### Added/);
  });

  it('throws on invalid semver', () => {
    assert.throws(
      () => updateVersions('not.valid', { root: tempRoot }),
      /Invalid semver/
    );
  });

  it('throws when the changelog has no unreleased content', () => {
    fs.writeFileSync(
      path.join(tempRoot, 'CHANGELOG.md'),
      '# Changelog\n\n## [Unreleased]\n\n## [1.6.1] - 2026-04-10\n',
      'utf8'
    );

    assert.throws(
      () => updateVersions('1.7.0', { root: tempRoot, dateString: '2026-04-12' }),
      /no content/i
    );
  });
});
