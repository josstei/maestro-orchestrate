'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const { get, getBool } = require('../../src/lib/stdin');

describe('stdin helpers', () => {
  describe('get()', () => {
    it('returns value for existing key', () => {
      assert.equal(get({ foo: 'bar' }, 'foo'), 'bar');
    });

    it('returns empty string for missing key', () => {
      assert.equal(get({ foo: 'bar' }, 'baz'), '');
    });

    it('returns empty string for null obj', () => {
      assert.equal(get(null, 'foo'), '');
    });
  });

  describe('getBool()', () => {
    it('returns true for truthy value', () => {
      assert.equal(getBool({ a: true }, 'a'), true);
    });

    it('returns true for string "true"', () => {
      assert.equal(getBool({ a: 'true' }, 'a'), true);
    });

    it('returns false for missing key', () => {
      assert.equal(getBool({ a: true }, 'b'), false);
    });

    it('returns false for falsy value', () => {
      assert.equal(getBool({ a: false }, 'a'), false);
    });
  });

  describe('readJson()', () => {
    const READJSON_HARNESS = path.resolve(__dirname, '..', '..', 'src', 'lib', 'stdin.js');

    function runReadJsonProcess(stdinContent) {
      const script = `
        const { readJson } = require('${READJSON_HARNESS.replace(/\\/g, '\\\\')}');
        readJson().then((result) => {
          process.stdout.write(JSON.stringify(result));
        });
      `;
      return execFileSync('node', ['-e', script], {
        input: stdinContent,
        encoding: 'utf8',
        timeout: 5000,
      });
    }

    it('parses valid JSON from stdin', () => {
      const result = JSON.parse(runReadJsonProcess('{"foo":"bar"}'));
      assert.deepEqual(result, { foo: 'bar' });
    });

    it('returns empty object for empty stdin', () => {
      const result = JSON.parse(runReadJsonProcess(''));
      assert.deepEqual(result, {});
    });

    it('returns empty object for whitespace-only stdin', () => {
      const result = JSON.parse(runReadJsonProcess('   \n  '));
      assert.deepEqual(result, {});
    });

    it('returns empty object for malformed JSON', () => {
      const result = JSON.parse(runReadJsonProcess('{not valid json'));
      assert.deepEqual(result, {});
    });
  });
});
