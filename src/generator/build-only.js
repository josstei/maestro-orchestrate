'use strict';

// Sources that only generate, analyze or package the runtimes. Runtime code
// must not depend on them and the extension archive omits them; npm retains
// them for its generate/build/prepack commands and Codex installer.
const BUILD_ONLY_PATHS = Object.freeze([
  'entry-points',
  'generator',
  'lib/discovery',
  'lib/yaml-emit.js',
  'platforms/metadata.js',
  'platforms/qwen/policy-pack.js',
  'transforms',
]);

/** Whether a POSIX path relative to src/ is, or lies under, a build-only path. */
function isBuildOnly(relativePath) {
  return BUILD_ONLY_PATHS.some((buildPath) =>
    relativePath === buildPath || relativePath.startsWith(`${buildPath}/`));
}

module.exports = { BUILD_ONLY_PATHS, isBuildOnly };
