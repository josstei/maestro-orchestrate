'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { checkCommand, normalizeSegment } = require('../../src/hooks/policy/policy-enforcer');

describe('prefix-evasion is blocked', () => {
  const evasions = [
    'env rm -rf /', 'x=1 rm -rf /', 'env FOO=bar rm -rf /tmp/x',
    '/bin/rm -rf /', './rm -rf .', '\\rm -rf /', 'nice rm -rf /',
    'nice -n 10 rm -rf /', 'command rm -rf /', 'exec rm -rf /',
    'sudo -u root rm -rf /', 'time rm -rf /', 'nohup rm -rf /',
    'echo ok && env rm -rf /', 'a=1 b=2 /usr/bin/rm -fr /',
  ];
  for (const cmd of evasions) {
    it(`blocks: ${cmd}`, () => assert.equal(checkCommand(cmd).decision, 'block'));
  }
});

describe('normalizeSegment strips wrappers/paths', () => {
  it('env + assignment', () => assert.equal(normalizeSegment('env FOO=bar rm -rf /'), 'rm -rf /'));
  it('path basename', () => assert.equal(normalizeSegment('/bin/rm -rf /'), 'rm -rf /'));
  it('sudo value flag', () => assert.equal(normalizeSegment('sudo -u root rm -rf /'), 'rm -rf /'));
  it('leading escape', () => assert.equal(normalizeSegment('\\rm -rf /'), 'rm -rf /'));
});

describe('no false positives', () => {
  const safe = ['rm README-notes.md', 'git reset', 'echo environment ready', 'ls -la', 'rmdir emptydir'];
  for (const cmd of safe) {
    it(`approves: ${cmd}`, () => assert.equal(checkCommand(cmd).decision, 'approve'));
  }
});

describe('expanded destructive corpus is blocked', () => {
  const bad = [
    'find . -delete', 'find /tmp -name x -delete', 'dd if=/dev/zero of=/dev/sda',
    'mkfs.ext4 /dev/sdb', 'shred -u secret', 'truncate -s 0 important.log',
    'chmod -R 000 /', 'git push --force origin main', 'git push -f origin main',
    'rm --recursive --force /tmp/x', ':(){ :|:& };:',
  ];
  for (const cmd of bad) it(`blocks: ${cmd}`, () => assert.equal(checkCommand(cmd).decision, 'block'));
});

const { DENY_RULES } = require('../../src/core/policy-rules');
describe('corpus shape', () => {
  it('every rule declares tier command', () => {
    for (const r of DENY_RULES) assert.equal(r.tier, 'command', `${r.pattern} missing tier`);
  });
});
