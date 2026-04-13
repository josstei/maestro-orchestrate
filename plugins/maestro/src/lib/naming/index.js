'use strict';

const TITLE_SPECIAL_CASES = {
  'a11y-audit': 'Accessibility Audit',
  'seo-audit': 'SEO Audit',
};

/**
 * Convert a kebab-case name to snake_case.
 * @param {string} name - Name in kebab-case (e.g. 'api-designer')
 * @returns {string} Name in snake_case (e.g. 'api_designer')
 */
function toSnakeCase(name) {
  return name.replace(/-/g, '_');
}

/**
 * Convert a snake_case name to kebab-case.
 * @param {string} name - Name in snake_case (e.g. 'api_designer')
 * @returns {string} Name in kebab-case (e.g. 'api-designer')
 */
function toKebabCase(name) {
  return name.replace(/_/g, '-');
}

/**
 * Convert a kebab-case name to PascalCase.
 * @param {string} name - Name in kebab-case (e.g. 'session-start')
 * @returns {string} Name in PascalCase (e.g. 'SessionStart')
 */
function toPascalCase(name) {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * Convert a kebab-case name to title case for display.
 * Includes special-case handling for abbreviations and accessibility terms.
 *
 * @param {string} name - Name in kebab-case (e.g. 'perf-check')
 * @returns {string} Display-friendly title (e.g. 'Perf Check')
 */
function toTitleCase(name) {
  if (TITLE_SPECIAL_CASES[name]) {
    return TITLE_SPECIAL_CASES[name];
  }
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Replace all occurrences of canonical kebab-case names in content
 * with the target naming convention.
 *
 * When targetCase is 'snake_case', each name in the provided list
 * is matched using word-boundary regexes and replaced with its snake_case
 * equivalent. When targetCase is 'kebab-case', content is returned unchanged
 * since kebab-case is the canonical format.
 *
 * @param {string} content - Text content containing name references
 * @param {string[]} names - Canonical kebab-case names to replace
 * @param {string} targetCase - Target convention: 'snake_case' or 'kebab-case'
 * @returns {string} Content with names converted to the target convention
 */
function replaceInContent(content, names, targetCase) {
  if (targetCase !== 'snake_case') {
    return content;
  }

  if (!names || names.length === 0) {
    return content;
  }

  let result = content;
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
    result = result.replace(pattern, toSnakeCase(name));
  }
  return result;
}

module.exports = {
  TITLE_SPECIAL_CASES,
  toSnakeCase,
  toKebabCase,
  toPascalCase,
  toTitleCase,
  replaceInContent,
};
