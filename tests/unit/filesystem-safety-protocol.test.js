'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PROTO = path.resolve(__dirname, '../../src/skills/shared/delegation/protocols/filesystem-safety-protocol.md');

describe('filesystem-safety-protocol', () => {
  const text = fs.readFileSync(PROTO, 'utf8');
  it('states the workspace write boundary', () => assert.match(text, /outside the workspace/i));
  it('names the destructive-command class', () => assert.match(text, /rm -rf|destructive/i));
});
