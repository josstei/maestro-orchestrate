import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const CJS_PATTERNS = [
  { name: 'require(', pattern: /\brequire\(/ },
  { name: 'module.exports', pattern: /\bmodule\.exports\b/ },
  { name: 'exports.', pattern: /(?<![.\w])exports\.\w/ },
  { name: '__dirname', pattern: /\b__dirname\b/ },
  { name: '__filename', pattern: /\b__filename\b/ },
  { name: 'require.main', pattern: /\brequire\.main\b/ },
];

function readPackageFilesField() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return packageJson.files;
}

function collectJsFiles(absolutePath) {
  const stats = fs.statSync(absolutePath, { throwIfNoEntry: false });
  if (!stats) {
    return [];
  }

  if (stats.isFile()) {
    return absolutePath.endsWith('.js') ? [absolutePath] : [];
  }

  const results = [];
  for (const entry of fs.readdirSync(absolutePath, { withFileTypes: true })) {
    const entryPath = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(entryPath);
    }
  }
  return results;
}

function collectShippedJsFiles() {
  const filesField = readPackageFilesField();
  const jsFiles = new Set();

  for (const relativeEntry of filesField) {
    for (const absolutePath of collectJsFiles(path.join(ROOT, relativeEntry))) {
      jsFiles.add(absolutePath);
    }
  }

  return [...jsFiles].sort();
}

describe('esm-purity: shipped package.json files set', () => {
  const shippedJsFiles = collectShippedJsFiles();

  it('discovers at least one shipped .js file to guard', () => {
    assert.ok(shippedJsFiles.length > 0, 'Expected the files set to include shipped .js files');
  });

  it('contains zero CJS residue across every shipped .js file', () => {
    const violations = [];

    for (const absolutePath of shippedJsFiles) {
      if (absolutePath === __filename) {
        continue;
      }

      const content = fs.readFileSync(absolutePath, 'utf8');
      const relativePath = path.relative(ROOT, absolutePath);

      for (const { name, pattern } of CJS_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`${relativePath}: found "${name}"`);
        }
      }
    }

    assert.deepEqual(violations, [], `CJS residue found:\n${violations.join('\n')}`);
  });
});
