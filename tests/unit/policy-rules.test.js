'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DENY_RULES, ASK_RULES } = require('../../src/core/policy-rules');

const VALID_MATCH_TYPES = new Set(['prefix', 'regex', 'word']);

function matchesRule(rule, command) {
  if (rule.matchType === 'prefix') {
    return command.startsWith(rule.pattern);
  }
  if (rule.matchType === 'regex') {
    return new RegExp(rule.pattern).test(command);
  }
  if (rule.matchType === 'word') {
    return new RegExp(`\\b${rule.pattern}\\b`).test(command);
  }
  return false;
}

describe('policy-rules', () => {
  describe('DENY_RULES', () => {
    it('is frozen', () => {
      assert.equal(Object.isFrozen(DENY_RULES), true);
    });

    it('has the correct count of 11 rules', () => {
      assert.equal(DENY_RULES.length, 11);
    });

    it('all entries have required fields matchType, pattern, and reason', () => {
      for (const rule of DENY_RULES) {
        assert.equal(typeof rule.matchType, 'string', `matchType must be a string: ${JSON.stringify(rule)}`);
        assert.equal(typeof rule.pattern, 'string', `pattern must be a string: ${JSON.stringify(rule)}`);
        assert.equal(typeof rule.reason, 'string', `reason must be a string: ${JSON.stringify(rule)}`);
      }
    });

    it('all matchType values are one of prefix, regex, or word', () => {
      for (const rule of DENY_RULES) {
        assert.ok(
          VALID_MATCH_TYPES.has(rule.matchType),
          `Invalid matchType "${rule.matchType}" in rule: ${JSON.stringify(rule)}`
        );
      }
    });

    it('every reason is a non-empty string', () => {
      for (const rule of DENY_RULES) {
        assert.ok(rule.reason.length > 0, `reason must be non-empty: ${JSON.stringify(rule)}`);
      }
    });

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
        assert.ok(matchesRule(rule, command), `Expected "${command}" to match prefix rule "${pattern}"`);
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
        assert.equal(matchesRule(rule, command), false, `Expected "${command}" NOT to match prefix rule "${pattern}"`);
      }
    });

    it('regex rule for heredoc matches <<EOF and << EOF', () => {
      const heredocRule = DENY_RULES.find(r => r.matchType === 'regex' && r.pattern === '<<');
      assert.ok(heredocRule, 'No heredoc regex rule found');
      assert.ok(matchesRule(heredocRule, '<<EOF'), 'Expected "<<EOF" to match heredoc rule');
      assert.ok(matchesRule(heredocRule, '<< EOF'), 'Expected "<< EOF" to match heredoc rule');
      assert.ok(matchesRule(heredocRule, 'cat <<EOF'), 'Expected "cat <<EOF" to match heredoc rule');
    });
  });

  describe('ASK_RULES', () => {
    it('is frozen', () => {
      assert.equal(Object.isFrozen(ASK_RULES), true);
    });

    it('has the correct count of 2 rules', () => {
      assert.equal(ASK_RULES.length, 2);
    });

    it('all entries have required fields matchType, pattern, and reason', () => {
      for (const rule of ASK_RULES) {
        assert.equal(typeof rule.matchType, 'string', `matchType must be a string: ${JSON.stringify(rule)}`);
        assert.equal(typeof rule.pattern, 'string', `pattern must be a string: ${JSON.stringify(rule)}`);
        assert.equal(typeof rule.reason, 'string', `reason must be a string: ${JSON.stringify(rule)}`);
      }
    });

    it('all matchType values are one of prefix, regex, or word', () => {
      for (const rule of ASK_RULES) {
        assert.ok(
          VALID_MATCH_TYPES.has(rule.matchType),
          `Invalid matchType "${rule.matchType}" in rule: ${JSON.stringify(rule)}`
        );
      }
    });

    it('every reason is a non-empty string', () => {
      for (const rule of ASK_RULES) {
        assert.ok(rule.reason.length > 0, `reason must be non-empty: ${JSON.stringify(rule)}`);
      }
    });

    it('word rule for tee matches commands containing the word tee', () => {
      const teeRule = ASK_RULES.find(r => r.matchType === 'word' && r.pattern === 'tee');
      assert.ok(teeRule, 'No word rule found for "tee"');
      assert.ok(matchesRule(teeRule, 'echo hi | tee file.txt'), 'Expected "echo hi | tee file.txt" to match');
      assert.ok(matchesRule(teeRule, 'tee output.log'), 'Expected "tee output.log" to match');
    });

    it('word rule for tee does not match substrings like teeming or committee', () => {
      const teeRule = ASK_RULES.find(r => r.matchType === 'word' && r.pattern === 'tee');
      assert.ok(teeRule, 'No word rule found for "tee"');
      assert.equal(matchesRule(teeRule, 'teeming with ideas'), false, 'Expected "teeming" NOT to match tee word rule');
      assert.equal(matchesRule(teeRule, 'committee vote'), false, 'Expected "committee" NOT to match tee word rule');
    });

    it('regex rule for redirection matches output redirection operators', () => {
      const redirectRule = ASK_RULES.find(r => r.matchType === 'regex' && r.pattern.includes('>>?'));
      assert.ok(redirectRule, 'No regex redirection rule found');
      assert.ok(matchesRule(redirectRule, 'echo foo > file'), 'Expected "echo foo > file" to match');
      assert.ok(matchesRule(redirectRule, 'echo foo >> file'), 'Expected "echo foo >> file" to match');
      assert.ok(matchesRule(redirectRule, '2> /dev/null'), 'Expected "2> /dev/null" to match');
      assert.ok(matchesRule(redirectRule, 'cmd >> log.txt'), 'Expected "cmd >> log.txt" to match');
    });

    it('regex rule for redirection does not match strings without redirection operators', () => {
      const redirectRule = ASK_RULES.find(r => r.matchType === 'regex' && r.pattern.includes('>>?'));
      assert.ok(redirectRule, 'No regex redirection rule found');
      assert.equal(matchesRule(redirectRule, 'echo hello world'), false, 'Expected plain echo to not match');
      assert.equal(matchesRule(redirectRule, 'git status'), false, 'Expected "git status" to not match');
      assert.equal(matchesRule(redirectRule, 'ls -la'), false, 'Expected "ls -la" to not match');
    });
  });
});
