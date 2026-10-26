'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  toSnakeCase,
  toKebabCase,
  toPascalCase,
  toTitleCase,
  escapeRegExp,
  toNamingConvention,
  replaceInContent,
} = require('../../src/lib/naming');

const HOOK_PASCAL_EXPECTED = {
  'after-agent': 'AfterAgent',
  'before-agent': 'BeforeAgent',
  'session-end': 'SessionEnd',
  'session-start': 'SessionStart',
};

const ENTRY_POINT_TITLE_EXPECTED = {
  'review': 'Review',
  'review-code': 'Review Code',
  'debug': 'Debug',
  'debug-workflow': 'Debug Workflow',
  'archive': 'Archive',
  'status': 'Status',
  'security-audit': 'Security Audit',
  'perf-check': 'Perf Check',
  'compliance-check': 'Compliance Check',
  'orchestrate': 'Orchestrate',
  'execute': 'Execute',
  'resume': 'Resume',
  'resume-session': 'Resume Session',
};

describe('toSnakeCase', () => {
  for (const [title, input, expected] of [
    ['converts kebab-case to snake_case', 'api-designer', 'api_designer'],
    ['handles single-word names without hyphens', 'coder', 'coder'],
    ['handles multiple hyphens', 'design-system-engineer', 'design_system_engineer'],
    ['returns empty string for empty input', '', ''],
    ['does not alter underscores already present', 'snake_case', 'snake_case'],
  ]) {
    it(title, () => {
      assert.equal(toSnakeCase(input), expected);
    });
  }
});

describe('toKebabCase', () => {
  for (const [title, input, expected] of [
    ['converts snake_case to kebab-case', 'api_designer', 'api-designer'],
    ['handles single-word names without underscores', 'coder', 'coder'],
    ['handles multiple underscores', 'design_system_engineer', 'design-system-engineer'],
    ['returns empty string for empty input', '', ''],
    ['does not alter hyphens already present', 'kebab-case', 'kebab-case'],
  ]) {
    it(title, () => {
      assert.equal(toKebabCase(input), expected);
    });
  }
});

describe('toPascalCase', () => {
  for (const [title, input, expected] of [
    ['converts single-word name', 'coder', 'Coder'],
    ['converts two-part kebab name', 'session-start', 'SessionStart'],
    ['converts three-part kebab name', 'design-system-engineer', 'DesignSystemEngineer'],
    ['returns empty string for empty input', '', ''],
    ['preserves existing capitalization within parts', 'i18n-specialist', 'I18nSpecialist'],
  ]) {
    it(title, () => {
      assert.equal(toPascalCase(input), expected);
    });
  }

  // Hook names, which registry-scanner prefixes with `handle`.
  for (const [hookName, expected] of Object.entries(HOOK_PASCAL_EXPECTED)) {
    it(`toPascalCase('${hookName}') === '${expected}'`, () => {
      assert.equal(toPascalCase(hookName), expected);
    });
  }
});

describe('toTitleCase', () => {
  for (const [title, input, expected] of [
    ['converts single-word name to title case', 'review', 'Review'],
    ['converts multi-word kebab name to title case with spaces', 'security-audit', 'Security Audit'],
    ['returns empty string for empty input', '', ''],
  ]) {
    it(title, () => {
      assert.equal(toTitleCase(input), expected);
    });
  }

  // Entry-point names that have no registry title.
  for (const [epName, expected] of Object.entries(ENTRY_POINT_TITLE_EXPECTED)) {
    it(`toTitleCase('${epName}') === '${expected}'`, () => {
      assert.equal(toTitleCase(epName), expected);
    });
  }
});

describe('escapeRegExp', () => {
  it('escapes every RegExp metacharacter so the input matches literally', () => {
    const raw = 'a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o';
    assert.equal(escapeRegExp(raw), 'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o');
    assert.ok(new RegExp(`^${escapeRegExp(raw)}$`).test(raw));
  });

  it('leaves kebab-case and snake_case names unchanged', () => {
    assert.equal(escapeRegExp('code-reviewer'), 'code-reviewer');
    assert.equal(escapeRegExp('api_designer'), 'api_designer');
  });
});

describe('toNamingConvention', () => {
  it('converts kebab-case to snake_case when target is snake_case', () => {
    assert.equal(toNamingConvention('design-system-engineer', 'snake_case'), 'design_system_engineer');
  });

  it('returns the name unchanged when target is kebab-case', () => {
    assert.equal(toNamingConvention('api-designer', 'kebab-case'), 'api-designer');
  });

  it('returns the name unchanged for unknown or missing target case', () => {
    assert.equal(toNamingConvention('api-designer', 'camelCase'), 'api-designer');
    assert.equal(toNamingConvention('api-designer', undefined), 'api-designer');
  });

  it('passes a missing name through unless converting to snake_case', () => {
    assert.equal(toNamingConvention(undefined, 'kebab-case'), undefined);
    assert.throws(() => toNamingConvention(undefined, 'snake_case'), TypeError);
  });
});

describe('replaceInContent', () => {
  it('replaces kebab-case names with snake_case when target is snake_case', () => {
    const content = 'Delegate to api-designer for review.';
    const result = replaceInContent(content, ['api-designer'], 'snake_case');
    assert.equal(result, 'Delegate to api_designer for review.');
  });

  it('returns content unchanged when target is kebab-case', () => {
    const content = 'Delegate to api-designer for review.';
    const result = replaceInContent(content, ['api-designer'], 'kebab-case');
    assert.equal(result, content);
  });

  it('returns content unchanged for null names', () => {
    const result = replaceInContent('some content', null, 'snake_case');
    assert.equal(result, 'some content');
  });

  it('returns content unchanged for empty names array', () => {
    const result = replaceInContent('some content', [], 'snake_case');
    assert.equal(result, 'some content');
  });

  it('replaces multiple distinct names in one pass', () => {
    const content = 'The code-reviewer and api-designer collaborate.';
    const result = replaceInContent(content, ['code-reviewer', 'api-designer'], 'snake_case');
    assert.equal(result, 'The code_reviewer and api_designer collaborate.');
  });

  it('replaces all occurrences of the same name', () => {
    const content = 'Use code-reviewer first, then code-reviewer again.';
    const result = replaceInContent(content, ['code-reviewer'], 'snake_case');
    assert.equal(result, 'Use code_reviewer first, then code_reviewer again.');
  });

  it('respects word boundaries and does not replace partial matches', () => {
    const content = 'The xcode-reviewer and code-reviewers are not code-reviewer.';
    const result = replaceInContent(content, ['code-reviewer'], 'snake_case');
    assert.equal(result, 'The xcode-reviewer and code-reviewers are not code_reviewer.');
  });

  it('handles regex special characters in names safely', () => {
    const content = 'test namexwith-dots and name.with-dots here';
    const result = replaceInContent(content, ['name.with-dots'], 'snake_case');
    assert.equal(result, 'test namexwith-dots and name.with_dots here');
  });

  it('returns content unchanged for unknown target case', () => {
    const content = 'some api-designer content';
    const result = replaceInContent(content, ['api-designer'], 'camelCase');
    assert.equal(result, content);
  });
});
