import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { isWriteAllowed } from '../../src/hooks/policy/policy-enforcer.js';
const ROOT = path.join(os.tmpdir());

describe('write-boundary jail', () => {
  it('allows a path inside the workspace root', () => {
    assert.equal(isWriteAllowed(path.join(ROOT, 'proj', 'a.txt'), path.join(ROOT, 'proj'), []), true);
  });
  it('denies an absolute path outside the root', () => {
    assert.equal(isWriteAllowed('/etc/passwd', path.join(ROOT, 'proj'), []), false);
  });
  it('denies a parent-traversal escape', () => {
    assert.equal(isWriteAllowed(path.join(ROOT, 'proj', '..', 'evil.txt'), path.join(ROOT, 'proj'), []), false);
  });
  it('honors the allowlist', () => {
    assert.equal(isWriteAllowed(path.join(ROOT, 'state', 'x'), path.join(ROOT, 'proj'), [path.join(ROOT, 'state')]), true);
  });
  it('fails closed when root is null', () => {
    assert.equal(isWriteAllowed(path.join(ROOT, 'x'), null, []), false);
  });
});
