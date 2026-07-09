import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSubshells,
  normalizeSegment,
  readBacktickSubshell,
  readDollarSubshell,
  splitCommands,
} from '../../dist/src/hooks/policy/shell-parser.js';

describe('policy shell parser', () => {
  it('splits top-level shell command operators but preserves quoted operators', () => {
    assert.deepEqual(splitCommands('echo "a && b"; rm -rf /tmp/x | cat'), [
      'echo "a && b"',
      'rm -rf /tmp/x',
      'cat',
    ]);
  });

  it('extracts nested dollar and backtick substitutions', () => {
    assert.deepEqual(extractSubshells('echo $(echo `rm -rf /`)'), [
      'echo `rm -rf /`',
      'rm -rf /',
    ]);
  });

  it('normalizes wrappers, value flags, env assignments, escapes, and path prefixes', () => {
    assert.equal(normalizeSegment('env FOO=bar sudo -u root /bin/rm -rf /'), 'rm -rf /');
    assert.equal(normalizeSegment('\\rm -rf /'), 'rm -rf /');
  });

  it('reports unterminated substitutions as parser errors', () => {
    assert.throws(() => readDollarSubshell('echo $(rm -rf /', 7), /Unterminated/);
    assert.throws(() => readBacktickSubshell('echo `rm -rf /', 6), /Unterminated/);
  });
});
