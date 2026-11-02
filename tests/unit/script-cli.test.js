'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseFlagArgs } = require('../../scripts/lib/cli');

describe('script argument parsing', () => {
  it('parses value flags and boolean switches, defaulting switches to false', () => {
    const spec = { flags: { '--tag': 'tag' }, booleans: { '--dry-run': 'dryRun' } };

    assert.deepEqual(parseFlagArgs([], spec), { dryRun: false });
    assert.deepEqual(parseFlagArgs(['--dry-run', '--tag', 'rc'], spec), { tag: 'rc', dryRun: true });
  });

  it('rejects a value flag without a value or with an empty one', () => {
    const spec = { flags: { '--tag': 'tag', '--access': 'access' } };

    assert.throws(() => parseFlagArgs(['--tag'], spec), { message: 'Missing value for --tag' });
    assert.throws(() => parseFlagArgs(['--tag', 'rc', '--access'], spec), { message: 'Missing value for --access' });
    assert.throws(() => parseFlagArgs(['--access', ''], spec), { message: 'Missing value for --access' });
  });

  it('collects at most one bare argument', () => {
    const spec = { positional: 'archive path' };

    assert.deepEqual(parseFlagArgs([], spec), { positionals: [] });
    assert.deepEqual(parseFlagArgs(['release.tar.gz'], spec), { positionals: ['release.tar.gz'] });
    assert.throws(() => parseFlagArgs(['a.tar.gz', 'b.tar.gz'], spec), { message: 'Expected at most one archive path' });
  });

  it('rejects unknown flags and unexpected positionals', () => {
    assert.throws(() => parseFlagArgs(['--foo'], { positional: 'file' }), { message: 'Unknown argument: --foo' });
    assert.throws(
      () => parseFlagArgs(['extra'], { booleans: { '--dry-run': 'dryRun' } }),
      { message: 'Unknown argument: extra' }
    );
  });

  it('prints usage and exits when -h or --help appears anywhere', (t) => {
    t.mock.method(process, 'exit', (code) => {
      throw new Error(`exit ${code}`);
    });
    const log = t.mock.method(console, 'log', () => {});

    for (const argv of [['--foo', '--help'], ['--tag', '-h']]) {
      assert.throws(() => parseFlagArgs(argv, { flags: { '--tag': 'tag' }, usage: 'Usage: x' }), { message: 'exit 0' });
    }
    assert.deepEqual(log.mock.calls.map((call) => call.arguments), [['Usage: x'], ['Usage: x']]);
  });
});
