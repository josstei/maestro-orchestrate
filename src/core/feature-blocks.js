'use strict';

const FEATURE_BLOCK_REGEX =
  /^[ \t]*<!-- @feature (\S+) -->\n([\s\S]*?)^[ \t]*<!-- @end-feature -->\n?/gm;

const EXAMPLE_BLOCK_REGEX = /^[ \t]*<example>[ \t]*\n[\s\S]*?^[ \t]*<\/example>[ \t]*\n?/gm;

const COLLAPSED_NEWLINE_REGEX = /\n{3,}/g;

/**
 * @param {string} content - Markdown content potentially containing feature blocks
 * @param {Record<string, boolean>} features - Map of feature flag names to boolean inclusion values
 * @returns {string} Content with feature blocks resolved and excess newlines collapsed
 * @throws {Error} When a feature flag is not present in the features object
 */
function stripFeatureBlocks(content, features) {
  const replaced = content.replace(
    FEATURE_BLOCK_REGEX,
    (_match, flagName, body) => {
      if (!(flagName in features)) {
        throw new Error(`Unknown feature flag: "${flagName}"`);
      }
      return features[flagName] ? body : '';
    }
  );

  return replaced.replace(COLLAPSED_NEWLINE_REGEX, '\n\n');
}

/**
 * Remove `<example>...</example>` blocks for runtimes without
 * `features.exampleBlocks`. An unclosed `<example>` is left in place.
 *
 * @param {string} content - Markdown content potentially containing example blocks
 * @returns {string} Content with example blocks removed and excess newlines collapsed
 */
function stripExamples(content) {
  return content.replace(EXAMPLE_BLOCK_REGEX, '').replace(COLLAPSED_NEWLINE_REGEX, '\n\n');
}

module.exports = { stripExamples, stripFeatureBlocks };
