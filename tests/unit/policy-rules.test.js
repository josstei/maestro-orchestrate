'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DENY_RULES, ASK_RULES, matchRule } = require('../../src/core/policy-rules');

const VALID_MATCH_TYPES = new Set(['prefix', 'regex', 'word']);

const RULE_LISTS = {
  DENY_RULES: { rules: DENY_RULES, count: 11 },
  ASK_RULES: { rules: ASK_RULES, count: 2 },
};

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
      const heredocRule = DENY_RULES.find(r => r.matchType === 'regex' && r.pattern === '<<');
      assert.ok(heredocRule, 'No heredoc regex rule found');
      assert.ok(matchRule(heredocRule, '<<EOF'), 'Expected "<<EOF" to match heredoc rule');
      assert.ok(matchRule(heredocRule, '<< EOF'), 'Expected "<< EOF" to match heredoc rule');
      assert.ok(matchRule(heredocRule, 'cat <<EOF'), 'Expected "cat <<EOF" to match heredoc rule');
    });
  });

  describe('ASK_RULES', () => {
    it('word rule for tee matches commands containing the word tee', () => {
      const teeRule = ASK_RULES.find(r => r.matchType === 'word' && r.pattern === 'tee');
      assert.ok(teeRule, 'No word rule found for "tee"');
      assert.ok(matchRule(teeRule, 'echo hi | tee file.txt'), 'Expected "echo hi | tee file.txt" to match');
      assert.ok(matchRule(teeRule, 'tee output.log'), 'Expected "tee output.log" to match');
    });

    it('word rule for tee does not match substrings like teeming or committee', () => {
      const teeRule = ASK_RULES.find(r => r.matchType === 'word' && r.pattern === 'tee');
      assert.ok(teeRule, 'No word rule found for "tee"');
      assert.equal(matchRule(teeRule, 'teeming with ideas'), false, 'Expected "teeming" NOT to match tee word rule');
      assert.equal(matchRule(teeRule, 'committee vote'), false, 'Expected "committee" NOT to match tee word rule');
    });

    it('regex rule for redirection matches output redirection operators', () => {
      const redirectRule = ASK_RULES.find(r => r.matchType === 'regex' && r.pattern.includes('>>?'));
      assert.ok(redirectRule, 'No regex redirection rule found');
      assert.ok(matchRule(redirectRule, 'echo foo > file'), 'Expected "echo foo > file" to match');
      assert.ok(matchRule(redirectRule, 'echo foo >> file'), 'Expected "echo foo >> file" to match');
      assert.ok(matchRule(redirectRule, '2> /dev/null'), 'Expected "2> /dev/null" to match');
      assert.ok(matchRule(redirectRule, 'cmd >> log.txt'), 'Expected "cmd >> log.txt" to match');
    });

    it('regex rule for redirection does not match strings without redirection operators', () => {
      const redirectRule = ASK_RULES.find(r => r.matchType === 'regex' && r.pattern.includes('>>?'));
      assert.ok(redirectRule, 'No regex redirection rule found');
      assert.equal(matchRule(redirectRule, 'echo hello world'), false, 'Expected plain echo to not match');
      assert.equal(matchRule(redirectRule, 'git status'), false, 'Expected "git status" to not match');
      assert.equal(matchRule(redirectRule, 'ls -la'), false, 'Expected "ls -la" to not match');
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
});
