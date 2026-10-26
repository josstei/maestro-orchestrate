'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { ROOT } = require('../support/paths');
const { runNode, runNodeOk } = require('../support/process');

const SCRIPT_PATH = path.join(ROOT, 'claude', 'scripts', 'policy-enforcer.js');
const ANTIGRAVITY_SCRIPT_PATH = path.join(ROOT, 'antigravity', 'hooks', 'policy-enforcer.js');
const DOLLAR = '$';
const BACKTICK = '`';
const BACKSLASH = '\\';

// `inner` in an escaped backtick substitution nested inside an outer one.
const nestedBackticks = (inner) =>
  `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}${inner}${BACKSLASH}${BACKTICK}"${BACKTICK}`;
// Antigravity's PreToolUse payload for run_command.
const antigravityInput = (CommandLine) => JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine } } });

// Claude cases check the decision alone; Antigravity cases check the whole answer.
for (const [script, toInput, pick, tests] of [
  [SCRIPT_PATH, (command) => JSON.stringify({ tool_input: { command } }), (answer) => answer.decision, {
    'blocks destructive commands in direct and nested dollar substitutions': [
      [`echo ${DOLLAR}(git reset --hard)`, 'block'],
      [`echo ${DOLLAR}(printf %s "${DOLLAR}(git reset --hard)")`, 'block'],
    ],
    'blocks destructive commands in nested backtick substitutions': [[nestedBackticks('git reset --hard'), 'block']],
    'blocks heredocs but approves here-strings and arithmetic shifts': [
      ["cat <<'EOF' > notes.md", 'block'],
      ['git status && cat << EOF', 'block'],
      [`echo ${DOLLAR}((1<<4))`, 'approve'],
      ['python3 -c "print(1 << 3)"', 'approve'],
      [`grep -c x <<<"${DOLLAR}value"`, 'approve'],
    ],
    'approves benign nested substitutions': [
      [`echo ${DOLLAR}(printf %s "${DOLLAR}(git status --short)")`, 'approve'],
      [`echo ${DOLLAR}(printf %s "${DOLLAR}(pwd)" | sed "s#/tmp#/tmp#") && echo ok`, 'approve'],
      [nestedBackticks('pwd'), 'approve'],
    ],
  }],
  [ANTIGRAVITY_SCRIPT_PATH, antigravityInput, (answer) => answer, {
    'antigravity denies destructive commands, including chained and substituted ones': [
      ['rm -rf build', { decision: 'deny', reason: 'Recursive force delete' }],
      [`ls && echo ${DOLLAR}(git reset --hard)`, { decision: 'deny', reason: 'Discards uncommitted changes' }],
    ],
    'antigravity forces a prompt for tee and output redirects': [
      ['echo hi | tee out.txt', { decision: 'force_ask', reason: 'Writes to file and stdout' }],
      ['echo hi > out.txt', { decision: 'force_ask', reason: 'Shell output redirection' }],
    ],
    'antigravity leaves other commands to the user permission settings': [
      ['git status --short', { decision: 'ask' }],
      [`echo ${DOLLAR}(pwd)`, { decision: 'ask' }],
    ],
  }],
]) {
  for (const [name, cases] of Object.entries(tests)) {
    test(name, () => {
      for (const [command, expected] of cases) {
        assert.deepEqual(pick(JSON.parse(runNodeOk(script, [], { input: toInput(command) }))), expected, command);
      }
    });
  }
}

test('antigravity denies the command when the policy check cannot run', () => {
  for (const input of ['not-json', antigravityInput(`echo ${DOLLAR}(pwd`)]) {
    const result = runNode(ANTIGRAVITY_SCRIPT_PATH, [], { input });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^Policy enforcer error: /);
    assert.deepEqual(JSON.parse(result.stdout), {
      decision: 'deny',
      reason: 'Policy enforcer internal error',
    });
  }
});
