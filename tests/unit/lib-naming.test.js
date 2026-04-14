'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  TITLE_SPECIAL_CASES,
  toSnakeCase,
  toKebabCase,
  toPascalCase,
  toTitleCase,
  replaceInContent,
} = require('../../src/lib/naming');

const AGENT_NAMES = [
  'accessibility-specialist',
  'analytics-engineer',
  'api-designer',
  'architect',
  'code-reviewer',
  'coder',
  'compliance-reviewer',
  'content-strategist',
  'copywriter',
  'data-engineer',
  'debugger',
  'design-system-engineer',
  'devops-engineer',
  'i18n-specialist',
  'performance-engineer',
  'product-manager',
  'refactor',
  'security-engineer',
  'seo-specialist',
  'technical-writer',
  'tester',
  'ux-designer',
];

const HOOK_NAMES = [
  'after-agent',
  'before-agent',
  'session-end',
  'session-start',
];

const HOOK_PASCAL_EXPECTED = {
  'after-agent': 'AfterAgent',
  'before-agent': 'BeforeAgent',
  'session-end': 'SessionEnd',
  'session-start': 'SessionStart',
};

const ENTRY_POINT_NAMES = [
  'review',
  'debug',
  'archive',
  'status',
  'security-audit',
  'perf-check',
  'seo-audit',
  'a11y-audit',
  'compliance-check',
  'orchestrate',
  'execute',
  'resume',
];

const ENTRY_POINT_TITLE_EXPECTED = {
  'review': 'Review',
  'debug': 'Debug',
  'archive': 'Archive',
  'status': 'Status',
  'security-audit': 'Security Audit',
  'perf-check': 'Perf Check',
  'seo-audit': 'SEO Audit',
  'a11y-audit': 'Accessibility Audit',
  'compliance-check': 'Compliance Check',
  'orchestrate': 'Orchestrate',
  'execute': 'Execute',
  'resume': 'Resume',
};

describe('toSnakeCase', () => {
  it('converts kebab-case to snake_case', () => {
    assert.equal(toSnakeCase('api-designer'), 'api_designer');
  });

  it('handles single-word names without hyphens', () => {
    assert.equal(toSnakeCase('coder'), 'coder');
  });

  it('handles multiple hyphens', () => {
    assert.equal(toSnakeCase('design-system-engineer'), 'design_system_engineer');
  });

  it('returns empty string for empty input', () => {
    assert.equal(toSnakeCase(''), '');
  });

  it('does not alter underscores already present', () => {
    assert.equal(toSnakeCase('snake_case'), 'snake_case');
  });
});

describe('toKebabCase', () => {
  it('converts snake_case to kebab-case', () => {
    assert.equal(toKebabCase('api_designer'), 'api-designer');
  });

  it('handles single-word names without underscores', () => {
    assert.equal(toKebabCase('coder'), 'coder');
  });

  it('handles multiple underscores', () => {
    assert.equal(toKebabCase('design_system_engineer'), 'design-system-engineer');
  });

  it('returns empty string for empty input', () => {
    assert.equal(toKebabCase(''), '');
  });

  it('does not alter hyphens already present', () => {
    assert.equal(toKebabCase('kebab-case'), 'kebab-case');
  });
});

describe('toPascalCase', () => {
  it('converts single-word name', () => {
    assert.equal(toPascalCase('coder'), 'Coder');
  });

  it('converts two-part kebab name', () => {
    assert.equal(toPascalCase('session-start'), 'SessionStart');
  });

  it('converts three-part kebab name', () => {
    assert.equal(toPascalCase('design-system-engineer'), 'DesignSystemEngineer');
  });

  it('returns empty string for empty input', () => {
    assert.equal(toPascalCase(''), '');
  });

  it('preserves existing capitalization within parts', () => {
    assert.equal(toPascalCase('i18n-specialist'), 'I18nSpecialist');
  });
});

describe('toTitleCase', () => {
  it('converts single-word name to title case', () => {
    assert.equal(toTitleCase('review'), 'Review');
  });

  it('converts multi-word kebab name to title case with spaces', () => {
    assert.equal(toTitleCase('security-audit'), 'Security Audit');
  });

  it('applies special-case mapping for a11y-audit', () => {
    assert.equal(toTitleCase('a11y-audit'), 'Accessibility Audit');
  });

  it('applies special-case mapping for seo-audit', () => {
    assert.equal(toTitleCase('seo-audit'), 'SEO Audit');
  });

  it('returns empty string for empty input', () => {
    assert.equal(toTitleCase(''), '');
  });

  it('exposes TITLE_SPECIAL_CASES map', () => {
    assert.equal(typeof TITLE_SPECIAL_CASES, 'object');
    assert.equal(TITLE_SPECIAL_CASES['a11y-audit'], 'Accessibility Audit');
    assert.equal(TITLE_SPECIAL_CASES['seo-audit'], 'SEO Audit');
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
    const content = 'Use coder first, then coder again.';
    const result = replaceInContent(content, ['coder'], 'snake_case');
    assert.equal(result, 'Use coder first, then coder again.');
  });

  it('respects word boundaries and does not replace partial matches', () => {
    const content = 'The debugger-tool is not debugger.';
    const result = replaceInContent(content, ['debugger'], 'snake_case');
    assert.equal(result, 'The debugger-tool is not debugger.');
  });

  it('handles regex special characters in names safely', () => {
    const content = 'test name.with.dots here';
    const result = replaceInContent(content, ['name.with.dots'], 'snake_case');
    assert.equal(result, 'test name.with.dots here');
  });

  it('returns content unchanged for unknown target case', () => {
    const content = 'some api-designer content';
    const result = replaceInContent(content, ['api-designer'], 'camelCase');
    assert.equal(result, content);
  });
});

describe('toPascalCase matches registry-scanner hookNameToFunctionName (minus handle prefix)', () => {
  for (const hookName of HOOK_NAMES) {
    it(`toPascalCase('${hookName}') === '${HOOK_PASCAL_EXPECTED[hookName]}'`, () => {
      assert.equal(toPascalCase(hookName), HOOK_PASCAL_EXPECTED[hookName]);
    });
  }
});

describe('toTitleCase matches entry-point-expander toTitle', () => {
  for (const epName of ENTRY_POINT_NAMES) {
    it(`toTitleCase('${epName}') === '${ENTRY_POINT_TITLE_EXPECTED[epName]}'`, () => {
      assert.equal(toTitleCase(epName), ENTRY_POINT_TITLE_EXPECTED[epName]);
    });
  }
});
