import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveDocumentInput } from '../../src/mcp/handlers/document-input.js';
import { ValidationError } from '../../src/lib/errors/index.js';

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
