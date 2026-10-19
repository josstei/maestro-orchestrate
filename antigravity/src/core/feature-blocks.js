'use strict';

const FEATURE_BLOCK_REGEX =
  /^[ \t]*<!-- @feature (\S+) -->\n([\s\S]*?)^[ \t]*<!-- @end-feature -->\n?/gm;

const COLLAPSED_NEWLINE_REGEX = /\n{3,}/g;

/**
 * @param {string} content - Markdown content potentially containing feature blocks
 * @param {Record<string, boolean>} features - Map of feature flag names to boolean inclusion values
 * @param {{ mode?: 'strict' | 'lenient' }} [opts] - Configuration options
 * @returns {string} Content with feature blocks resolved and excess newlines collapsed
 * @throws {Error} In strict mode, when a feature flag is not present in the features object
 */
function stripFeatureBlocks(content, features, opts) {
  const mode = (opts && opts.mode) || 'strict';

  const replaced = content.replace(
    FEATURE_BLOCK_REGEX,
    (_match, flagName, body) => {
      if (!(flagName in features)) {
        if (mode === 'strict') {
          throw new Error(`Unknown feature flag: "${flagName}"`);
        }
        return '';
      }
      return features[flagName] ? body : '';
    }
  );

  return replaced.replace(COLLAPSED_NEWLINE_REGEX, '\n\n');
}

module.exports = { stripFeatureBlocks };
