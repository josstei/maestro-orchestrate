import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDocumentationPath } from '../../dist/src/mcp/session/documentation-classifier.js';

describe('documentation-classifier', () => {
  it('classifies documentation files correctly', () => {
    assert.equal(isDocumentationPath('docs/guide.md'), true);
    assert.equal(isDocumentationPath('docs/maestro/state/active-session.md'), true);
    assert.equal(isDocumentationPath('.github/PULL_REQUEST_TEMPLATE.md'), true);
    assert.equal(isDocumentationPath('README.md'), true);
    assert.equal(isDocumentationPath('README'), true);
    assert.equal(isDocumentationPath('LICENSE'), true);
    assert.equal(isDocumentationPath('CHANGELOG.md'), true);
    assert.equal(isDocumentationPath('subfolder/architecture.rst'), true);
  });

  it('classifies implementation files as non-documentation', () => {
    assert.equal(isDocumentationPath('src/index.ts'), false);
    assert.equal(isDocumentationPath('src/mcp/handlers/get-agent.ts'), false);
    assert.equal(isDocumentationPath('tests/unit/foo.test.js'), false);
    assert.equal(isDocumentationPath('package.json'), false);
    assert.equal(isDocumentationPath('tsconfig.json'), false);
  });

  it('handles invalid or empty paths safely', () => {
    assert.equal(isDocumentationPath(''), false);
    assert.equal(isDocumentationPath(null), false);
    assert.equal(isDocumentationPath(undefined), false);
  });
});
