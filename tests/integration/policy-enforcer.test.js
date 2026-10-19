'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const { ROOT, withIsolatedAntigravityPlugin, withIsolatedClaudePlugin } = require('./helpers');

const SCRIPT_PATH = path.resolve(__dirname, '..', '..', 'claude', 'scripts', 'policy-enforcer.js');
const ANTIGRAVITY_SCRIPT_PATH = path.join(ROOT, 'antigravity', 'hooks', 'policy-enforcer.js');
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

// Antigravity's PreToolUse payload for run_command.
function runAntigravityPolicy(commandLine, scriptPath = ANTIGRAVITY_SCRIPT_PATH) {
  const input = JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: commandLine } } });
  const result = spawnPolicy(scriptPath, input);

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

test('blocks heredocs but approves here-strings and arithmetic shifts', () => {
  assert.equal(runPolicy("cat <<'EOF' > notes.md").decision, 'block');
  assert.equal(runPolicy('git status && cat << EOF').decision, 'block');

  assert.equal(runPolicy(`echo ${DOLLAR}((1<<4))`).decision, 'approve');
  assert.equal(runPolicy('python3 -c "print(1 << 3)"').decision, 'approve');
  assert.equal(runPolicy(`grep -c x <<<"${DOLLAR}value"`).decision, 'approve');
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

test('antigravity denies destructive commands, including chained and substituted ones', () => {
  assert.deepEqual(runAntigravityPolicy('rm -rf build'), {
    decision: 'deny',
    reason: 'Recursive force delete',
  });
  assert.deepEqual(runAntigravityPolicy(`ls && echo ${DOLLAR}(git reset --hard)`), {
    decision: 'deny',
    reason: 'Discards uncommitted changes',
  });
});

test('antigravity forces a prompt for tee and output redirects', () => {
  assert.deepEqual(runAntigravityPolicy('echo hi | tee out.txt'), {
    decision: 'force_ask',
    reason: 'Writes to file and stdout',
  });
  assert.deepEqual(runAntigravityPolicy('echo hi > out.txt'), {
    decision: 'force_ask',
    reason: 'Shell output redirection',
  });
});

test('antigravity leaves other commands to the user permission settings', () => {
  assert.deepEqual(runAntigravityPolicy('git status --short'), { decision: 'ask' });
  assert.deepEqual(runAntigravityPolicy(`echo ${DOLLAR}(pwd)`), { decision: 'ask' });
});

test('antigravity denies the command when the policy check cannot run', () => {
  const unterminated = JSON.stringify({
    toolCall: { name: 'run_command', args: { CommandLine: `echo ${DOLLAR}(pwd` } },
  });

  for (const input of ['not-json', unterminated]) {
    const result = spawnPolicy(ANTIGRAVITY_SCRIPT_PATH, input);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^Policy enforcer error: /);
    assert.deepEqual(JSON.parse(result.stdout), {
      decision: 'deny',
      reason: 'Policy enforcer internal error',
    });
  }
});

test('the installed antigravity plugin enforces the bundled policy rules', async () => {
  await withIsolatedAntigravityPlugin(async (pluginRoot) => {
    const scriptPath = path.join(pluginRoot, 'hooks', 'policy-enforcer.js');

    assert.deepEqual(runAntigravityPolicy('git reset --hard', scriptPath), {
      decision: 'deny',
      reason: 'Discards uncommitted changes',
    });
    assert.deepEqual(runAntigravityPolicy('echo hi | tee out.txt', scriptPath), {
      decision: 'force_ask',
      reason: 'Writes to file and stdout',
    });
    assert.deepEqual(runAntigravityPolicy('git status', scriptPath), { decision: 'ask' });

    const oversized = spawnPolicy(scriptPath, 'x'.repeat(2 * 1024 * 1024));
    assert.equal(oversized.status, 1);
    assert.equal(oversized.stderr, 'Policy enforcer: stdin payload too large\n');
    assert.deepEqual(JSON.parse(oversized.stdout), { decision: 'deny', reason: 'Payload too large' });
  });
});
