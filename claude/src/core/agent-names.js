'use strict';

/**
 * Convert a kebab-case agent name to snake_case.
 * @param {string} name - Agent name in kebab-case (e.g. 'api-designer')
 * @returns {string} Agent name in snake_case (e.g. 'api_designer')
 */
function toSnakeCase(name) {
  return name.replace(/-/g, '_');
}

/**
 * Convert a snake_case agent name to kebab-case.
 * @param {string} name - Agent name in snake_case (e.g. 'api_designer')
 * @returns {string} Agent name in kebab-case (e.g. 'api-designer')
 */
function toKebabCase(name) {
  return name.replace(/_/g, '-');
}

/**
 * Replace all occurrences of canonical kebab-case agent names in content
 * with the target naming convention.
 *
 * When targetNaming is 'snake_case', each agent name in the provided list
 * is matched using word-boundary regexes and replaced with its snake_case
 * equivalent. When targetNaming is 'kebab-case', content is returned unchanged
 * since kebab-case is the canonical format.
 *
 * @param {string} content - Text content containing agent name references
 * @param {string[]} agentNames - Canonical kebab-case agent names to replace
 * @param {string} targetNaming - Target convention: 'snake_case' or 'kebab-case'
 * @returns {string} Content with agent names converted to the target convention
 */
function replaceInContent(content, agentNames, targetNaming) {
  if (targetNaming !== 'snake_case') {
    return content;
  }

  if (!agentNames || agentNames.length === 0) {
    return content;
  }

  let result = content;
  for (const name of agentNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'g');
    result = result.replace(pattern, toSnakeCase(name));
  }
  return result;
}

module.exports = { toSnakeCase, toKebabCase, replaceInContent };
