'use strict';

// Sources that only generate, analyze or package the runtimes. Runtime code
// must not depend on them, and neither the extension archive nor npm ships them.
const BUILD_ONLY_PATHS = Object.freeze([
  'entry-points',
  'generator',
  'lib/discovery',
  'platforms/metadata.js',
  'platforms/qwen/policy-pack.js',
]);

/** Whether a POSIX path relative to src/ is, or lies under, a build-only path. */
function isBuildOnly(relativePath) {
  return BUILD_ONLY_PATHS.some((buildPath) =>
    relativePath === buildPath || relativePath.startsWith(`${buildPath}/`));
}

module.exports = { isBuildOnly };
