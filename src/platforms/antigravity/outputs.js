'use strict';

/**
 * What the generator writes for Antigravity. Build-time only: scripts/generate.js
 * reads it, and no detached payload ships it.
 */
module.exports = {
  ownedDirs: ['antigravity/agents', 'antigravity/skills'],

  // src/ prefixes antigravity/src/ ships beyond the shared base. The plugin's
  // hooks run the bundled hook logic through the shared hook and policy
  // runners, and the served script-based state contract runs
  // `node ${PLUGIN_ROOT}/src/scripts/...` against the installed plugin.
  payload: ['scripts/', 'hooks/', 'platforms/shared/'],
};
