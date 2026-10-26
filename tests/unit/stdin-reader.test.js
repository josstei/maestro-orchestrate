'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { ROOT } = require('../support/paths');
const { runNode } = require('../support/process');

const STDIN_READER = JSON.stringify(path.join(ROOT, 'src', 'core', 'stdin-reader.js'));
const READ_TEXT = `require(${STDIN_READER}).readText().then(
  (result) => process.stdout.write(JSON.stringify({ ok: true, result })),
  (error) => process.stdout.write(JSON.stringify({ ok: false, error: error.message })));`;

/** Pipes `input` into a child that awaits readText and reports its outcome. */
const readStdin = (input) => JSON.parse(runNode('-e', [READ_TEXT], { input }).stdout);
// 'é' is 2 bytes: 512 KiB of them is exactly the 1 MiB cap, one more exceeds it.
const AT_CAP = 'é'.repeat(512 * 1024);

describe('stdin-reader.readText', () => {
  for (const [name, input] of [
    ['returns the full piped payload', 'hello world'],
    ['returns an empty string for empty stdin', ''],
    ['counts the cap in raw UTF-8 bytes and decodes multi-byte input intact', AT_CAP],
  ]) {
    it(name, () => {
      assert.deepEqual(readStdin(input), { ok: true, result: input });
    });
  }

  for (const [name, input] of [
    ['rejects when payload exceeds the 1 MiB cap', 'a'.repeat(1024 * 1024 + 10)],
    ['rejects a multi-byte payload one character over the cap', `${AT_CAP}é`],
  ]) {
    it(name, () => {
      const { ok, error } = readStdin(input);
      assert.equal(ok, false);
      assert.match(error, /Stdin payload too large/);
    });
  }
});
