/**
 * Process feature-flagged blocks in content.
 * Markdown: <!-- @feature name --> ... <!-- @end-feature -->
 * JS:       // @feature name ... // @end-feature
 *
 * If runtime.features[name] is true, keep content and strip markers.
 * If false, remove content and markers.
 * Unknown feature names throw an error.
 *
 * @param {string} content
 * @param {object} runtime
 * @returns {string}
 */
function stripFeature(content, runtime) {
  let result = content;
  let changed = true;

  while (changed) {
    changed = false;

    // Markdown feature blocks — match innermost only (body contains no nested @feature start)
    result = result.replace(
      /^[ \t]*<!-- @feature (\S+) -->\n((?:(?!<!-- @feature )[\s\S])*?)^[ \t]*<!-- @end-feature -->\n?/gm,
      (match, flagName, body) => {
        changed = true;
        if (!(flagName in runtime.features)) {
          throw new Error(`Unknown feature flag: "${flagName}"`);
        }
        return runtime.features[flagName] ? body : '';
      }
    );

    // JS feature blocks — match innermost only (body contains no nested @feature start)
    result = result.replace(
      /^[ \t]*\/\/ @feature (\S+)\n((?:(?!\/\/ @feature )[\s\S])*?)^[ \t]*\/\/ @end-feature\n?/gm,
      (match, flagName, body) => {
        changed = true;
        if (!(flagName in runtime.features)) {
          throw new Error(`Unknown feature flag: "${flagName}"`);
        }
        return runtime.features[flagName] ? body : '';
      }
    );
  }

  // Clean up excessive blank lines (3+ -> 2)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

module.exports = stripFeature;
