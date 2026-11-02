'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  toSnakeCase,
  toPascalCase,
  toTitleCase,
  escapeRegExp,
  toNamingConvention,
} = require('../../src/lib/naming');

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
