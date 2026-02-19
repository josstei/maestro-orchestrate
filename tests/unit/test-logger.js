'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../../src/lib/logger');

describe('logger', () => {
  it('exports a log function', () => {
    assert.equal(typeof logger.log, 'function');
  });

  it('writes formatted message to stderr', () => {
    const original = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += chunk; return true; };
    try {
      logger.log('INFO', 'test message');
      assert.equal(captured, '[INFO] maestro: test message\n');
    } finally {
      process.stderr.write = original;
    }
  });

  it('handles WARN level', () => {
    const original = process.stderr.write;
    let captured = '';
    process.stderr.write = (chunk) => { captured += chunk; return true; };
    try {
      logger.log('WARN', 'something wrong');
      assert.equal(captured, '[WARN] maestro: something wrong\n');
    } finally {
      process.stderr.write = original;
    }
  });
});
