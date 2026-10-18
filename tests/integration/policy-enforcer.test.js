'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const { withIsolatedClaudePlugin } = require('./helpers');

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'claude', 'scripts', 'policy-enforcer.js');
const DOLLAR = '$';
const BACKTICK = '`';
const BACKSLASH = '\\';

function spawnPolicy(scriptPath, input) {
  return spawnSync(process.execPath, [scriptPath], { input, encoding: 'utf8' });
}

function runPolicy(command, scriptPath = SCRIPT_PATH) {
  const result = spawnPolicy(scriptPath, JSON.stringify({ tool_input: { command } }));

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test('blocks destructive commands in direct and nested dollar substitutions', () => {
  assert.equal(runPolicy(`echo ${DOLLAR}(git reset --hard)`).decision, 'block');
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(git reset --hard)")`).decision,
    'block'
  );
});

test('blocks destructive commands in nested backtick substitutions', () => {
  const command =
    `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}` +
    `git reset --hard${BACKSLASH}${BACKTICK}"${BACKTICK}`;

  assert.equal(runPolicy(command).decision, 'block');
});

test('approves benign nested substitutions', () => {
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(git status --short)")`).decision,
    'approve'
  );
  assert.equal(
    runPolicy(`echo ${DOLLAR}(printf %s "${DOLLAR}(pwd)" | sed "s#/tmp#/tmp#") && echo ok`).decision,
    'approve'
  );

  const backtickCommand =
    `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}` +
    `pwd${BACKSLASH}${BACKTICK}"${BACKTICK}`;

  assert.equal(runPolicy(backtickCommand).decision, 'approve');
});

test('the installed claude plugin enforces the bundled policy rules', async () => {
  await withIsolatedClaudePlugin(async (pluginRoot) => {
    const scriptPath = path.join(pluginRoot, 'scripts', 'policy-enforcer.js');

    assert.deepEqual(runPolicy('git reset --hard', scriptPath), {
      decision: 'block',
      reason: 'Discards uncommitted changes',
    });
    assert.deepEqual(runPolicy('echo hi | tee out.txt', scriptPath), {
      decision: 'ask',
      reason: 'Writes to file and stdout',
    });
    assert.deepEqual(runPolicy('git status', scriptPath), { decision: 'approve' });

    const oversized = spawnPolicy(scriptPath, 'x'.repeat(2 * 1024 * 1024));
    assert.equal(oversized.status, 1);
    assert.equal(oversized.stderr, 'Policy enforcer: stdin payload too large\n');
    assert.deepEqual(JSON.parse(oversized.stdout), { decision: 'block', reason: 'Payload too large' });
  });
});
