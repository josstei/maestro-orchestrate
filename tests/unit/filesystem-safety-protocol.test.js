import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const moduleFilename = fileURLToPath(import.meta.url);
const moduleDirname = path.dirname(moduleFilename);
const PROTO = path.resolve(moduleDirname, '../../src/skills/shared/delegation/protocols/filesystem-safety-protocol.md');

describe('filesystem-safety-protocol', () => {
  const text = fs.readFileSync(PROTO, 'utf8');
  it('states the workspace write boundary', () => assert.match(text, /outside the workspace/i));
  it('names the destructive-command class', () => assert.match(text, /rm -rf|destructive/i));
});
