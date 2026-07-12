import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repoPath } from '../support/paths.js';

const PROTO = repoPath('src/skills/shared/delegation/protocols/filesystem-safety-protocol.md');

describe('filesystem-safety-protocol', () => {
  const text = fs.readFileSync(PROTO, 'utf8');
  it('states the workspace write boundary', () => assert.match(text, /outside the workspace/i));
  it('names the destructive-command class', () => assert.match(text, /rm -rf|destructive/i));
});
