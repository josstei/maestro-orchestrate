'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseFlagArgs } = require('../../scripts/lib/cli');

const printHelp = () => {};

describe('script argument parsing', () => {
  it('parses value flags and boolean switches, defaulting switches to false', () => {
    const spec = { defaults: { tag: null }, flags: { '--tag': 'tag' }, booleans: { '--dry-run': 'dryRun' }, printHelp };

    assert.deepEqual(parseFlagArgs([], spec), { tag: null, dryRun: false });
    assert.deepEqual(parseFlagArgs(['--dry-run', '--tag', 'rc'], spec), { tag: 'rc', dryRun: true });
  });

  it('collects at most one bare argument', () => {
    const spec = { positional: 'archive path', printHelp };

    assert.deepEqual(parseFlagArgs([], spec), { positionals: [] });
    assert.deepEqual(parseFlagArgs(['release.tar.gz'], spec), { positionals: ['release.tar.gz'] });
    assert.throws(() => parseFlagArgs(['a.tar.gz', 'b.tar.gz'], spec), { message: 'Expected at most one archive path' });
  });

  it('rejects unknown flags and unexpected positionals', () => {
    assert.throws(() => parseFlagArgs(['--foo'], { positional: 'archive path', printHelp }), { message: 'Unknown argument: --foo' });
    assert.throws(
      () => parseFlagArgs(['extra'], { booleans: { '--dry-run': 'dryRun' }, printHelp }),
      { message: 'Unknown argument: extra' }
    );
  });

  it('prints help and exits when -h or --help appears anywhere', (t) => {
    t.mock.method(process, 'exit', (code) => {
      throw new Error(`exit ${code}`);
    });

    for (const argv of [['--foo', '--help'], ['--tag', '-h']]) {
      const help = t.mock.fn();
      assert.throws(() => parseFlagArgs(argv, { flags: { '--tag': 'tag' }, printHelp: help }), { message: 'exit 0' });
      assert.equal(help.mock.callCount(), 1);
    }
  });
});
