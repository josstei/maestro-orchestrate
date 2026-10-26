'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DENY_RULES, ASK_RULES, matchRule, checkCommand } = require('../../src/core/policy-rules');

const VALID_MATCH_TYPES = new Set(['prefix', 'regex', 'word']);
const DOLLAR = '$';
const BACKTICK = '`';
const BACKSLASH = '\\';

const HEREDOC_RULE = DENY_RULES.find(r => r.matchType === 'regex' && r.reason.startsWith('Heredoc'));
const TEE_RULE = ASK_RULES.find(r => r.matchType === 'word' && r.pattern === 'tee');
const REDIRECT_RULE = ASK_RULES.find(r => r.matchType === 'regex' && r.pattern.includes('>>?'));

describe('policy-rules', () => {
  for (const [name, rules, count] of [['DENY_RULES', DENY_RULES, 11], ['ASK_RULES', ASK_RULES, 2]]) {
    it(`${name} is a frozen list of ${count} rules, each with a known matchType, a pattern and a reason`, () => {
      assert.equal(Object.isFrozen(rules), true);
      assert.equal(rules.length, count);
      for (const rule of rules) {
        const where = JSON.stringify(rule);
        assert.ok(VALID_MATCH_TYPES.has(rule.matchType), `Invalid matchType in rule: ${where}`);
        assert.equal(typeof rule.pattern, 'string', `pattern must be a string: ${where}`);
        assert.ok(typeof rule.reason === 'string' && rule.reason.length > 0, `reason must be non-empty: ${where}`);
      }
    });
  }

  it('DENY_RULES prefix rules match commands that start with the pattern, and no others', () => {
    for (const [pattern, command, unanchored] of [
      ['rm -rf', 'rm -rf /tmp', 'removing files with rm -rf'],
      ['rm -fr', 'rm -fr /tmp', 'removing files with rm -fr'],
      ['sudo rm -rf', 'sudo rm -rf /'],
      ['sudo rm -fr', 'sudo rm -fr /'],
      ['git reset --hard', 'git reset --hard HEAD~1', 'echo git reset --hard'],
      ['git checkout --', 'git checkout -- src/index.js'],
      ['git clean -fd', 'git clean -fd', 'ls && git clean -fd'],
      ['git clean -df', 'git clean -df'],
      ['git clean -xfd', 'git clean -xfd'],
      ['git clean -xdf', 'git clean -xdf'],
    ]) {
      const rule = DENY_RULES.find(r => r.matchType === 'prefix' && r.pattern === pattern);
      assert.ok(rule, `No prefix rule found for pattern: ${pattern}`);
      assert.equal(matchRule(rule, command), true, command);
      if (unanchored) assert.equal(matchRule(rule, unanchored), false, unanchored);
    }
  });

  for (const [name, rule, matches, misses] of [
    ['heredoc rule matches quoted, escaped and tab-stripping delimiters but not here-strings, shifts or <<=',
      HEREDOC_RULE,
      ['<<EOF', '<< EOF', 'cat <<EOF', "cat <<'EOF'", 'cat << "EOF"', 'cat <<-EOF', 'cat <<\\EOF', 'cat<<EOF',
        'python3 - <<PY', 'cat <<END_OF_TEXT > notes.md'],
      ['echo $((1<<4))', 'python3 -c "print(1 << 3)"', 'cat <<<"$value"', 'cat <<< "$value"', 'cat <<<word',
        'x <<= 2']],
    ['tee word rule matches the word tee but not substrings like teeming or committee', TEE_RULE,
      ['echo hi | tee file.txt', 'tee output.log'], ['teeming with ideas', 'committee vote']],
    ['redirection rule matches output redirection operators only', REDIRECT_RULE,
      ['echo foo > file', 'echo foo >> file', '2> /dev/null', 'cmd >> log.txt'],
      ['echo hello world', 'git status', 'ls -la']],
  ]) {
    it(name, () => {
      assert.ok(rule, 'rule not found');
      for (const command of matches) assert.equal(matchRule(rule, command), true, `Expected ${command} to match`);
      for (const command of misses) assert.equal(matchRule(rule, command), false, `Expected ${command} NOT to match`);
    });
  }

  describe('matchRule', () => {
    it('ignores leading whitespace before matching', () => {
      assert.equal(matchRule({ matchType: 'prefix', pattern: 'rm -rf', reason: 'test' }, '  rm -rf /tmp'), true);
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
