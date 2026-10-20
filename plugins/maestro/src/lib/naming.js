'use strict';

const capitalizeParts = (name) =>
  name.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1));

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
  return capitalizeParts(name).join('');
}

/**
 * Convert a kebab-case name to title case for display.
 *
 * @param {string} name - Name in kebab-case (e.g. 'perf-check')
 * @returns {string} Display-friendly title (e.g. 'Perf Check')
 */
function toTitleCase(name) {
  return capitalizeParts(name).join(' ');
}

/**
 * Escape RegExp metacharacters so the string matches literally.
 * @param {string} value - Raw string
 * @returns {string} String safe to embed in a RegExp source
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Convert a canonical kebab-case name to the target naming convention.
 *
 * When targetCase is 'snake_case', the name is converted to snake_case.
 * Any other targetCase (such as 'kebab-case') returns the name unchanged
 * since kebab-case is the canonical format.
 *
 * @param {string} name - Canonical kebab-case name (e.g. 'api-designer')
 * @param {string} targetCase - Target convention: 'snake_case' or 'kebab-case'
 * @returns {string|undefined} Name in the target convention (a missing name passes through unless converting to snake_case)
 */
function toNamingConvention(name, targetCase) {
  return targetCase === 'snake_case' ? toSnakeCase(name) : name;
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
  if (targetCase !== 'snake_case' || !names) {
    return content;
  }

  let result = content;
  for (const name of names) {
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g');
    result = result.replace(pattern, toSnakeCase(name));
  }
  return result;
}

module.exports = {
  toSnakeCase,
  toKebabCase,
  toPascalCase,
  toTitleCase,
  escapeRegExp,
  toNamingConvention,
  replaceInContent,
};
