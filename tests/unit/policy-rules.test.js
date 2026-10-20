'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DENY_RULES, ASK_RULES, matchRule, checkCommand } = require('../../src/core/policy-rules');

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
        const rule = DENY_RULES.find(r => r.matchType === 'prefix' && r.pattern === pattern);
        assert.ok(rule, `No prefix rule found for pattern: ${pattern}`);
        assert.ok(matchRule(rule, command), `Expected "${command}" to match prefix rule "${pattern}"`);
      }
    });

    it('prefix rules do not match when the command does not start with the pattern', () => {
      const negativeCases = [
        { pattern: 'rm -rf',           command: 'removing files with rm -rf' },
        { pattern: 'rm -fr',           command: 'removing files with rm -fr' },
        { pattern: 'git reset --hard', command: 'echo git reset --hard' },
        { pattern: 'git clean -fd',    command: 'ls && git clean -fd' },
      ];

      for (const { pattern, command } of negativeCases) {
        const rule = DENY_RULES.find(r => r.matchType === 'prefix' && r.pattern === pattern);
        assert.ok(rule, `No prefix rule found for pattern: ${pattern}`);
        assert.equal(matchRule(rule, command), false, `Expected "${command}" NOT to match prefix rule "${pattern}"`);
      }
    });

    it('regex rule for heredoc matches <<EOF and << EOF', () => {
      assert.ok(HEREDOC_RULE, 'No heredoc regex rule found');
      assert.ok(matchRule(HEREDOC_RULE, '<<EOF'), 'Expected "<<EOF" to match heredoc rule');
      assert.ok(matchRule(HEREDOC_RULE, '<< EOF'), 'Expected "<< EOF" to match heredoc rule');
      assert.ok(matchRule(HEREDOC_RULE, 'cat <<EOF'), 'Expected "cat <<EOF" to match heredoc rule');
    });

    it('regex rule for heredoc matches quoted, escaped and tab-stripping delimiters', () => {
      for (const command of ["cat <<'EOF'", 'cat << "EOF"', 'cat <<-EOF', 'cat <<\\EOF', 'cat<<EOF', 'python3 - <<PY', 'cat <<END_OF_TEXT > notes.md']) {
        assert.ok(matchRule(HEREDOC_RULE, command), `Expected ${JSON.stringify(command)} to match heredoc rule`);
      }
    });

    it('regex rule for heredoc ignores here-strings, shifts and <<=', () => {
      for (const command of ['echo $((1<<4))', 'python3 -c "print(1 << 3)"', 'cat <<<"$value"', 'cat <<< "$value"', 'cat <<<word', 'x <<= 2']) {
        assert.equal(matchRule(HEREDOC_RULE, command), false, `Expected ${JSON.stringify(command)} NOT to match heredoc rule`);
      }
    });
  });

  describe('ASK_RULES', () => {
    it('word rule for tee matches commands containing the word tee', () => {
      assert.ok(TEE_RULE, 'No word rule found for "tee"');
      assert.ok(matchRule(TEE_RULE, 'echo hi | tee file.txt'), 'Expected "echo hi | tee file.txt" to match');
      assert.ok(matchRule(TEE_RULE, 'tee output.log'), 'Expected "tee output.log" to match');
    });

    it('word rule for tee does not match substrings like teeming or committee', () => {
      assert.equal(matchRule(TEE_RULE, 'teeming with ideas'), false, 'Expected "teeming" NOT to match tee word rule');
      assert.equal(matchRule(TEE_RULE, 'committee vote'), false, 'Expected "committee" NOT to match tee word rule');
    });

    it('regex rule for redirection matches output redirection operators', () => {
      assert.ok(REDIRECT_RULE, 'No regex redirection rule found');
      assert.ok(matchRule(REDIRECT_RULE, 'echo foo > file'), 'Expected "echo foo > file" to match');
      assert.ok(matchRule(REDIRECT_RULE, 'echo foo >> file'), 'Expected "echo foo >> file" to match');
      assert.ok(matchRule(REDIRECT_RULE, '2> /dev/null'), 'Expected "2> /dev/null" to match');
      assert.ok(matchRule(REDIRECT_RULE, 'cmd >> log.txt'), 'Expected "cmd >> log.txt" to match');
    });

    it('regex rule for redirection does not match strings without redirection operators', () => {
      assert.equal(matchRule(REDIRECT_RULE, 'echo hello world'), false, 'Expected plain echo to not match');
      assert.equal(matchRule(REDIRECT_RULE, 'git status'), false, 'Expected "git status" to not match');
      assert.equal(matchRule(REDIRECT_RULE, 'ls -la'), false, 'Expected "ls -la" to not match');
    });
  });

  describe('matchRule', () => {
    it('ignores leading whitespace before matching', () => {
      const rule = { matchType: 'prefix', pattern: 'rm -rf', reason: 'test' };
      assert.equal(matchRule(rule, '  rm -rf /tmp'), true);
    });

    it('never matches an unknown matchType', () => {
      assert.equal(matchRule({ matchType: 'glob', pattern: '*', reason: 'test' }, 'anything'), false);
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
