'use strict';

const { afterEach, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { extractChangelogSection } = require('../../scripts/changelog-section');

function writeChangelog(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-changelog-section-'));
  const filePath = path.join(dir, 'CHANGELOG.md');
  fs.writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

describe('changelog-section extractChangelogSection', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('extracts the content between the version header and the next section', () => {
    const { dir, filePath } = writeChangelog(
      [
        '# Changelog',
        '',
        '## [Unreleased]',
        '',
        '## [1.7.0] - 2026-04-12',
        '',
        '### Added',
        '',
        '- New thing',
        '',
        '## [1.6.1] - 2026-04-10',
        '',
        '### Fixed',
        '',
        '- Old fix',
        '',
      ].join('\n')
    );
    tempDir = dir;

    const section = extractChangelogSection(filePath, '1.7.0');

    assert.equal(section, ['', '### Added', '', '- New thing', ''].join('\n'));
  });

  it('extracts to end of file when the version is the last section', () => {
    const { dir, filePath } = writeChangelog(
      ['# Changelog', '', '## [1.0.0] - 2026-01-01', '', '### Added', '', '- First release'].join(
        '\n'
      )
    );
    tempDir = dir;

    const section = extractChangelogSection(filePath, '1.0.0');

    assert.equal(section, ['', '### Added', '', '- First release'].join('\n'));
  });

  it('throws when the version section is missing from CHANGELOG.md', () => {
    const { dir, filePath } = writeChangelog(
      ['# Changelog', '', '## [Unreleased]', '', '## [1.6.1] - 2026-04-10', ''].join('\n')
    );
    tempDir = dir;

    assert.throws(
      () => extractChangelogSection(filePath, '1.7.0'),
      /CHANGELOG\.md missing section for ## \[1\.7\.0\]/
    );
  });

  it('throws when the CHANGELOG.md file does not exist', () => {
    assert.throws(() => extractChangelogSection('/nonexistent/CHANGELOG.md', '1.0.0'));
  });
});
