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
    'package.json': { name: '@josstei/maestro', version, license: 'Apache-2.0' },
    'gemini-extension.json': { name: 'maestro', version },
    'qwen-extension.json': { name: 'maestro', version },
    'claude/.claude-plugin/plugin.json': { name: 'maestro', version },
    'plugins/maestro/.codex-plugin/plugin.json': { name: 'maestro', version },
    'plugins/maestro/.mcp.json': {
      mcpServers: {
        maestro: {
          command: 'npx',
          args: ['-y', '-p', `@josstei/maestro@${version}`, 'maestro-mcp-server'],
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

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
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

  it('updates only canonical stable release inputs', () => {
    updateVersions('1.7.0', { root: tempRoot, dateString: '2026-04-12' });

    const pkg = readJson(tempRoot, 'package.json');
    const gemini = readJson(tempRoot, 'gemini-extension.json');
    const qwen = readJson(tempRoot, 'qwen-extension.json');
    const claudePlugin = readJson(tempRoot, 'claude/.claude-plugin/plugin.json');
    const codexPlugin = readJson(tempRoot, 'plugins/maestro/.codex-plugin/plugin.json');
    const codexMcp = readJson(tempRoot, 'plugins/maestro/.mcp.json');
    const marketplace = readJson(tempRoot, '.claude-plugin/marketplace.json');

    assert.equal(pkg.version, '1.7.0');
    assert.equal(gemini.version, '1.6.1');
    assert.equal(qwen.version, '1.6.1');
    assert.equal(claudePlugin.version, '1.6.1');
    assert.equal(codexPlugin.version, '1.6.1');
    assert.ok(codexMcp.mcpServers.maestro.args.includes('@josstei/maestro@1.6.1'));
    assert.equal(marketplace.metadata.version, '1.6.1');
    assert.equal(marketplace.plugins[0].version, '1.6.1');
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
