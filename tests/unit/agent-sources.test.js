import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listAgentSources } from '../../dist/src/core/agent-sources.js';

const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const ROOT = path.resolve(moduleDirname, '../..');
const SRC = path.join(ROOT, 'src');

const CATALOG_SHA256 = '424018f5b724191b55b6c445a678d42e27c94930d4e2420b6afb9ec713431243';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('agent source composition', () => {
  it('keeps the full canonical catalog across physical and composed sources', () => {
    const sources = listAgentSources(SRC);

    assert.equal(sources.length, 39);
    assert.equal(new Set(sources.map((source) => source.name)).size, 39);
    assert.equal(new Set(sources.map((source) => source.relativePath)).size, 39);
  });

  it('renders the catalog byte-identically without keeping duplicate markdown files', () => {
    const sources = listAgentSources(SRC);
    const payload = sources.map((source) => `${source.relativePath}\n${source.content}`).join('\0');

    assert.equal(sha256(payload), CATALOG_SHA256);
    for (const source of sources) {
      assert.equal(source.origin, 'composed', `${source.name} is not composed`);
      assert.equal(fs.existsSync(path.join(SRC, source.relativePath)), false, `${source.name} still has duplicate markdown`);
    }
  });
});
