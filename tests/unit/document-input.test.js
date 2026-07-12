import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertPlansFilename,
  ensurePlansDocumentInPlans,
  plansDirPath,
  resolveDocumentInput,
  writePlansDocumentContent,
} from '../../dist/src/mcp/session/document-repository.js';
import { ValidationError } from '../../dist/src/lib/errors/index.js';
import { makeTempDir, writeFixtureFile } from '../support/filesystem.js';

const opts = (over = {}) => ({
  pathKey: 'doc_path', contentKey: 'doc_content', filenameKey: 'doc_filename',
  requireMessage: null,
  resolvePath: (p) => `resolved:${p}`,
  writeContent: (f, c) => `written:${f}:${c.length}`,
  ...over,
});

describe('resolveDocumentInput', () => {
  it('rejects path combined with content variant', () => {
    assert.throws(() => resolveDocumentInput({ doc_path: 'a', doc_content: 'b' }, opts()), ValidationError);
  });
  it('requires filename when content given', () => {
    assert.throws(() => resolveDocumentInput({ doc_content: 'b' }, opts()), ValidationError);
  });
  it('requires content when filename given', () => {
    assert.throws(() => resolveDocumentInput({ doc_filename: 'f.md' }, opts()), ValidationError);
  });
  it('writes the content variant', () => {
    assert.equal(resolveDocumentInput({ doc_content: 'xyz', doc_filename: 'f.md' }, opts()), 'written:f.md:3');
  });
  it('resolves the path variant', () => {
    assert.equal(resolveDocumentInput({ doc_path: 'p.md' }, opts()), 'resolved:p.md');
  });
  it('returns null when absent and optional', () => {
    assert.equal(resolveDocumentInput({}, opts()), null);
  });
  it('throws when absent and required', () => {
    assert.throws(() => resolveDocumentInput({}, opts({ requireMessage: 'need doc' })), /need doc/);
  });
});

describe('plans document helpers', () => {
  it('validates plans filenames as basenames only', () => {
    assert.doesNotThrow(() => assertPlansFilename('plan.md', 'plan_filename'));
    assert.throws(() => assertPlansFilename('../plan.md', 'plan_filename'), ValidationError);
    assert.throws(() => assertPlansFilename('nested/plan.md', 'plan_filename'), ValidationError);
    assert.throws(() => assertPlansFilename('.', 'plan_filename'), ValidationError);
    assert.throws(() => assertPlansFilename('bad\0name.md', 'plan_filename'), ValidationError);
  });

  it('writes inline document content under the workspace plans directory', (t) => {
    const workspace = makeTempDir(t, 'maestro-doc-input-');
    const result = writePlansDocumentContent(workspace, 'plan.md', '# Plan\n', 'plan_filename');
    assert.equal(result, path.join(plansDirPath(workspace), 'plan.md'));
    assert.equal(fs.readFileSync(result, 'utf8'), '# Plan\n');
  });

  it('copies external documents into plans and preserves in-plans paths', (t) => {
    const workspace = makeTempDir(t, 'maestro-doc-input-');
    const externalDir = makeTempDir(t, 'maestro-doc-external-');
    const externalPath = writeFixtureFile(externalDir, 'design.md', '# Design\n');

    const copied = ensurePlansDocumentInPlans(workspace, externalPath);
    assert.equal(copied, path.join(plansDirPath(workspace), 'design.md'));
    assert.equal(fs.readFileSync(copied, 'utf8'), '# Design\n');
    assert.equal(fs.existsSync(externalPath), true);

    assert.equal(ensurePlansDocumentInPlans(workspace, copied), copied);
  });
});
