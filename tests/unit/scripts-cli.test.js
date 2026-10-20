'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { exitOnHelp, parseFlagArgs } = require('../../scripts/lib/cli');

const EXITED = Symbol('exited');

/**
 * Runs `fn` with process.exit replaced, and reports whether help was printed
 * and which exit code was requested (null when fn returned normally).
 */
function runWithExitStub(fn) {
  const originalExit = process.exit;
  const result = { exitCode: null, helpPrinted: 0 };
  process.exit = (code) => {
    result.exitCode = code;
    throw EXITED;
  };
  try {
    fn(() => {
      result.helpPrinted += 1;
    });
  } catch (error) {
    if (error !== EXITED) {
      throw error;
    }
  } finally {
    process.exit = originalExit;
  }
  return result;
}

const SPEC = {
  defaults: { tag: null },
  flags: { '--tag': 'tag', '--out-dir': 'outDir' },
  booleans: { '--dry-run': 'dryRun' },
};

describe('parseFlagArgs', () => {
  it('reads value and boolean flags over the defaults', () => {
    const printHelp = () => assert.fail('help must not print');

    assert.deepEqual(parseFlagArgs([], { ...SPEC, printHelp }), { tag: null });
    assert.deepEqual(
      parseFlagArgs(['--dry-run', '--tag', 'rc', '--out-dir', 'out', '--dry-run'], { ...SPEC, printHelp }),
      { tag: 'rc', outDir: 'out', dryRun: true }
    );
  });

  it('takes the next argument as a value even when it looks like a flag', () => {
    const printHelp = () => assert.fail('help must not print');

    assert.deepEqual(parseFlagArgs(['--tag', '--help'], { ...SPEC, printHelp }), { tag: '--help' });
    assert.deepEqual(parseFlagArgs(['--tag', ''], { ...SPEC, printHelp }), { tag: '' });
  });

  it('rejects the first unknown argument and a value flag without a value', () => {
    const printHelp = () => assert.fail('help must not print');

    assert.throws(() => parseFlagArgs(['--bogus', '--other'], { ...SPEC, printHelp }), { message: 'Unknown argument: --bogus' });
    assert.throws(() => parseFlagArgs(['--dry-run=1'], { ...SPEC, printHelp }), { message: 'Unknown argument: --dry-run=1' });
    assert.throws(() => parseFlagArgs(['--dry-run', '--tag'], { ...SPEC, printHelp }), { message: 'Missing value for --tag' });
  });

  it('prints help and exits 0 when it reaches --help or -h', () => {
    for (const helpFlag of ['--help', '-h']) {
      const result = runWithExitStub((printHelp) => parseFlagArgs(['--dry-run', helpFlag], { ...SPEC, printHelp }));
      assert.deepEqual(result, { exitCode: 0, helpPrinted: 1 });
    }

    // An earlier invalid argument is reported first.
    assert.throws(
      () => runWithExitStub((printHelp) => parseFlagArgs(['--bogus', '--help'], { ...SPEC, printHelp })),
      { message: 'Unknown argument: --bogus' }
    );
  });
});

describe('exitOnHelp', () => {
  it('prints help and exits 0 when --help or -h appears anywhere', () => {
    for (const argv of [['--help'], ['-h'], ['--bogus', '--help'], ['a', 'b', '-h']]) {
      assert.deepEqual(runWithExitStub((printHelp) => exitOnHelp(argv, printHelp)), { exitCode: 0, helpPrinted: 1 });
    }
  });

  it('returns without printing when there is no help flag', () => {
    for (const argv of [[], ['--bogus'], ['--helpful', '-H']]) {
      assert.deepEqual(runWithExitStub((printHelp) => exitOnHelp(argv, printHelp)), { exitCode: null, helpPrinted: 0 });
    }
  });
});
