'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DENY_RULES, ASK_RULES, checkCommand } = require('../../src/platforms/shared/policy-rules');

const VALID_MATCH_TYPES = new Set(['prefix', 'regex', 'word']);
const DOLLAR = '$';
const BACKTICK = '`';
const BACKSLASH = '\\';

const RULE_LISTS = {
  DENY_RULES: { rules: DENY_RULES, count: 11 },
  ASK_RULES: { rules: ASK_RULES, count: 2 },
};

const HEREDOC_RULE = DENY_RULES.find(r => r.matchType === 'regex' && r.reason.startsWith('Heredoc'));
const TEE_RULE = ASK_RULES.find(r => r.matchType === 'word' && r.pattern === 'tee');
const REDIRECT_RULE = ASK_RULES.find(r => r.matchType === 'regex' && r.pattern.includes('>>?'));
const prefixRule = (pattern) => DENY_RULES.find(r => r.matchType === 'prefix' && r.pattern === pattern);

// Every rule has a distinct reason (pinned below), so checkCommand's reason names the rule that matched.
const denied = (rule) => ({ action: 'deny', reason: rule.reason });
const asked = (rule) => ({ action: 'ask', reason: rule.reason });
const ALLOW = { action: 'allow' };

describe('policy-rules', () => {
  for (const [name, { rules, count }] of Object.entries(RULE_LISTS)) {
    describe(`${name} shape`, () => {
      it('is frozen', () => {
        assert.equal(Object.isFrozen(rules), true);
      });

      it(`has the correct count of ${count} rules`, () => {
        assert.equal(rules.length, count);
      });

      it('all entries have required fields matchType, pattern, and reason', () => {
        for (const rule of rules) {
          assert.equal(typeof rule.matchType, 'string', `matchType must be a string: ${JSON.stringify(rule)}`);
          assert.equal(typeof rule.pattern, 'string', `pattern must be a string: ${JSON.stringify(rule)}`);
          assert.equal(typeof rule.reason, 'string', `reason must be a string: ${JSON.stringify(rule)}`);
        }
      });

      it('all matchType values are one of prefix, regex, or word', () => {
        for (const rule of rules) {
          assert.ok(
            VALID_MATCH_TYPES.has(rule.matchType),
            `Invalid matchType "${rule.matchType}" in rule: ${JSON.stringify(rule)}`
          );
        }
      });

      it('every reason is a non-empty string', () => {
        for (const rule of rules) {
          assert.ok(rule.reason.length > 0, `reason must be non-empty: ${JSON.stringify(rule)}`);
        }
      });
    });
  }

  it('gives every rule a distinct reason', () => {
    const reasons = [...DENY_RULES, ...ASK_RULES].map((rule) => rule.reason);
    assert.equal(new Set(reasons).size, reasons.length);
  });

  describe('DENY_RULES', () => {
    it('prefix rules match commands that start with the pattern', () => {
      const prefixCases = [
        { pattern: 'rm -rf',           command: 'rm -rf /tmp' },
        { pattern: 'rm -fr',           command: 'rm -fr /tmp' },
        { pattern: 'sudo rm -rf',      command: 'sudo rm -rf /' },
        { pattern: 'sudo rm -fr',      command: 'sudo rm -fr /' },
        { pattern: 'git reset --hard', command: 'git reset --hard HEAD~1' },
        { pattern: 'git checkout --',  command: 'git checkout -- src/index.js' },
        { pattern: 'git clean -fd',    command: 'git clean -fd' },
        { pattern: 'git clean -df',    command: 'git clean -df' },
        { pattern: 'git clean -xfd',   command: 'git clean -xfd' },
        { pattern: 'git clean -xdf',   command: 'git clean -xdf' },
      ];

      for (const { pattern, command } of prefixCases) {
        assert.deepEqual(checkCommand(command), denied(prefixRule(pattern)), command);
      }
    });

    it('prefix rules do not match when the command does not start with the pattern', () => {
      for (const command of [
        'removing files with rm -rf',
        'removing files with rm -fr',
        'echo git reset --hard',
        'echo git clean -fd',
      ]) {
        assert.deepEqual(checkCommand(command), ALLOW, command);
      }
    });

    it('prefix rules ignore leading whitespace', () => {
      assert.deepEqual(checkCommand('  rm -rf /tmp'), denied(prefixRule('rm -rf')));
    });

    it('regex rule for heredoc matches <<EOF and << EOF', () => {
      for (const command of ['<<EOF', '<< EOF', 'cat <<EOF']) {
        assert.deepEqual(checkCommand(command), denied(HEREDOC_RULE), command);
      }
    });

    it('regex rule for heredoc matches quoted, escaped and tab-stripping delimiters', () => {
      for (const command of ["cat <<'EOF'", 'cat << "EOF"', 'cat <<-EOF', 'cat <<\\EOF', 'cat<<EOF', 'python3 - <<PY', 'cat <<END_OF_TEXT > notes.md']) {
        assert.deepEqual(checkCommand(command), denied(HEREDOC_RULE), command);
      }
    });

    it('regex rule for heredoc ignores here-strings, shifts and <<=', () => {
      for (const command of ['echo $((1<<4))', 'python3 -c "print(1 << 3)"', 'cat <<<"$value"', 'cat <<< "$value"', 'cat <<<word', 'x <<= 2']) {
        assert.deepEqual(checkCommand(command), ALLOW, command);
      }
    });
  });

  describe('ASK_RULES', () => {
    it('word rule for tee matches commands containing the word tee', () => {
      assert.deepEqual(checkCommand('echo hi | tee file.txt'), asked(TEE_RULE));
      assert.deepEqual(checkCommand('tee output.log'), asked(TEE_RULE));
    });

    it('word rule for tee does not match substrings like teeming or committee', () => {
      assert.deepEqual(checkCommand('teeming with ideas'), ALLOW);
      assert.deepEqual(checkCommand('committee vote'), ALLOW);
    });

    it('regex rule for redirection matches output redirection operators', () => {
      for (const command of ['echo foo > file', 'echo foo >> file', '2> /dev/null', 'cmd >> log.txt']) {
        assert.deepEqual(checkCommand(command), asked(REDIRECT_RULE), command);
      }
    });

    it('regex rule for redirection does not match strings without redirection operators', () => {
      for (const command of ['echo hello world', 'git status', 'ls -la']) {
        assert.deepEqual(checkCommand(command), ALLOW, command);
      }
    });
  });

  describe('checkCommand', () => {
    it('allows a command that matches no rule', () => {
      assert.deepEqual(checkCommand('git status --short'), { action: 'allow' });
      assert.deepEqual(checkCommand(''), { action: 'allow' });
    });

    it('returns the reason of the matching deny or ask rule', () => {
      assert.deepEqual(checkCommand('rm -rf build'), { action: 'deny', reason: 'Recursive force delete' });
      assert.deepEqual(checkCommand('echo hi | tee out.txt'), { action: 'ask', reason: 'Writes to file and stdout' });
      assert.deepEqual(checkCommand('echo hi > out.txt'), { action: 'ask', reason: 'Shell output redirection' });
    });

    it('checks every segment split on ;, |, && and ||', () => {
      for (const command of [
        'ls && git clean -fd',
        'echo a; git reset --hard',
        'cat notes.txt || rm -fr build',
        'git status | git checkout -- src',
      ]) {
        assert.equal(checkCommand(command).action, 'deny', command);
      }
    });

    it('lets a deny rule win over any ask rule, including one in an earlier segment', () => {
      assert.deepEqual(checkCommand('echo hi > out.txt && rm -rf build'), {
        action: 'deny',
        reason: 'Recursive force delete',
      });
      assert.equal(checkCommand('cat <<EOF > notes.md').action, 'deny');
    });

    it('checks the commands inside dollar and backtick substitutions, nested or not', () => {
      for (const command of [
        `echo ${DOLLAR}(git reset --hard)`,
        `echo "${DOLLAR}(rm -rf build)"`,
        `echo ${DOLLAR}(printf %s "${DOLLAR}(git checkout -- src)")`,
        `echo ${BACKTICK}rm -rf build${BACKTICK}`,
        `echo ${BACKTICK}printf %s "${BACKSLASH}${BACKTICK}git reset --hard${BACKSLASH}${BACKTICK}"${BACKTICK}`,
      ]) {
        assert.equal(checkCommand(command).action, 'deny', command);
      }
      assert.deepEqual(checkCommand(`echo ${DOLLAR}(printf %s "${DOLLAR}(pwd)")`), { action: 'allow' });
    });

    it('treats single-quoted text as literal', () => {
      assert.deepEqual(checkCommand(`echo '${DOLLAR}(rm -rf build)'`), { action: 'allow' });
      assert.deepEqual(checkCommand("echo 'a; rm -rf build'"), { action: 'allow' });
    });

    it('throws on an unterminated command substitution', () => {
      assert.throws(() => checkCommand(`echo ${DOLLAR}(rm -rf build`), /Unterminated \$\(\.\.\.\) command substitution/);
      assert.throws(() => checkCommand(`echo ${BACKTICK}pwd`), /Unterminated backtick command substitution/);
    });
  });
});
