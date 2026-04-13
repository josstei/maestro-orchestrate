'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toSnakeCase, toKebabCase, replaceInContent } = require('../../src/core/agent-names');

const MULTI_WORD_AGENTS = [
  'api-designer',
  'code-reviewer',
  'data-engineer',
  'devops-engineer',
  'performance-engineer',
  'security-engineer',
  'technical-writer',
  'seo-specialist',
  'content-strategist',
  'ux-designer',
  'accessibility-specialist',
  'product-manager',
  'analytics-engineer',
  'i18n-specialist',
  'design-system-engineer',
  'compliance-reviewer',
];

describe('toSnakeCase', () => {
  it('converts kebab-case to snake_case', () => {
    assert.equal(toSnakeCase('api-designer'), 'api_designer');
    assert.equal(toSnakeCase('devops-engineer'), 'devops_engineer');
    assert.equal(toSnakeCase('design-system-engineer'), 'design_system_engineer');
  });

  it('returns single-word names unchanged', () => {
    assert.equal(toSnakeCase('architect'), 'architect');
    assert.equal(toSnakeCase('coder'), 'coder');
    assert.equal(toSnakeCase('debugger'), 'debugger');
  });

  it('returns names with no hyphens unchanged', () => {
    assert.equal(toSnakeCase('already_snake'), 'already_snake');
    assert.equal(toSnakeCase('singleword'), 'singleword');
  });
});

describe('toKebabCase', () => {
  it('converts snake_case to kebab-case', () => {
    assert.equal(toKebabCase('api_designer'), 'api-designer');
    assert.equal(toKebabCase('devops_engineer'), 'devops-engineer');
    assert.equal(toKebabCase('design_system_engineer'), 'design-system-engineer');
  });

  it('returns single-word names unchanged', () => {
    assert.equal(toKebabCase('architect'), 'architect');
    assert.equal(toKebabCase('coder'), 'coder');
    assert.equal(toKebabCase('debugger'), 'debugger');
  });

  it('returns names with no underscores unchanged', () => {
    assert.equal(toKebabCase('already-kebab'), 'already-kebab');
    assert.equal(toKebabCase('singleword'), 'singleword');
  });
});

describe('replaceInContent', () => {
  it('replaces agent names when target is snake_case', () => {
    const content = 'Delegate to code-reviewer for review.';
    const result = replaceInContent(content, ['code-reviewer'], 'snake_case');
    assert.equal(result, 'Delegate to code_reviewer for review.');
  });

  it('returns content unchanged when target is kebab-case', () => {
    const content = 'Delegate to code-reviewer for review.';
    const result = replaceInContent(content, ['code-reviewer'], 'kebab-case');
    assert.equal(result, content);
  });

  it('respects word boundaries matching the legacy \\b behavior', () => {
    const content = 'The xcode-reviewer is not a code-reviewer agent.';
    const result = replaceInContent(content, ['code-reviewer'], 'snake_case');
    assert.equal(result, 'The xcode-reviewer is not a code_reviewer agent.');
  });

  it('handles content with multiple distinct agent names', () => {
    const content = 'Send to api-designer then code-reviewer then devops-engineer.';
    const result = replaceInContent(
      content,
      ['api-designer', 'code-reviewer', 'devops-engineer'],
      'snake_case'
    );
    assert.equal(result, 'Send to api_designer then code_reviewer then devops_engineer.');
  });

  it('handles multiple occurrences of the same agent name', () => {
    const content = 'code-reviewer said code-reviewer approved.';
    const result = replaceInContent(content, ['code-reviewer'], 'snake_case');
    assert.equal(result, 'code_reviewer said code_reviewer approved.');
  });

  it('returns content unchanged when agent names array is empty', () => {
    const content = 'Delegate to code-reviewer for review.';
    const result = replaceInContent(content, [], 'snake_case');
    assert.equal(result, content);
  });

  it('returns content unchanged when agent names array is null', () => {
    const content = 'Delegate to code-reviewer for review.';
    const result = replaceInContent(content, null, 'snake_case');
    assert.equal(result, content);
  });

  it('produces identical output to the legacy 16-chain replace approach', () => {
    const content = [
      'The api-designer reviewed the schema.',
      'Ask code-reviewer and data-engineer to check.',
      'The devops-engineer and performance-engineer ran benchmarks.',
      'Notify security-engineer, technical-writer, and seo-specialist.',
      'Also loop in content-strategist and ux-designer.',
      'The accessibility-specialist filed a report.',
      'Tell product-manager and analytics-engineer.',
      'The i18n-specialist and design-system-engineer collaborated.',
      'Finally compliance-reviewer signed off.',
    ].join('\n');

    const legacyResult = content
      .replace(/\bapi-designer\b/g, 'api_designer')
      .replace(/\bcode-reviewer\b/g, 'code_reviewer')
      .replace(/\bdata-engineer\b/g, 'data_engineer')
      .replace(/\bdevops-engineer\b/g, 'devops_engineer')
      .replace(/\bperformance-engineer\b/g, 'performance_engineer')
      .replace(/\bsecurity-engineer\b/g, 'security_engineer')
      .replace(/\btechnical-writer\b/g, 'technical_writer')
      .replace(/\bseo-specialist\b/g, 'seo_specialist')
      .replace(/\bcontent-strategist\b/g, 'content_strategist')
      .replace(/\bux-designer\b/g, 'ux_designer')
      .replace(/\baccessibility-specialist\b/g, 'accessibility_specialist')
      .replace(/\bproduct-manager\b/g, 'product_manager')
      .replace(/\banalytics-engineer\b/g, 'analytics_engineer')
      .replace(/\bi18n-specialist\b/g, 'i18n_specialist')
      .replace(/\bdesign-system-engineer\b/g, 'design_system_engineer')
      .replace(/\bcompliance-reviewer\b/g, 'compliance_reviewer');

    const newResult = replaceInContent(content, MULTI_WORD_AGENTS, 'snake_case');

    assert.equal(newResult, legacyResult);
  });

  it('leaves single-word agent names untouched since they have no hyphens', () => {
    const content = 'The architect and coder and debugger and tester and refactor and copywriter worked.';
    const result = replaceInContent(
      content,
      ['architect', 'coder', 'debugger', 'tester', 'refactor', 'copywriter'],
      'snake_case'
    );
    assert.equal(result, content);
  });
});
