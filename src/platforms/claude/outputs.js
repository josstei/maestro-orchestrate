'use strict';

/**
 * What the generator writes for Claude Code. Build-time only: scripts/generate.js
 * reads it, and no detached payload ships it.
 */
module.exports = {
  ownedDirs: ['claude/agents', 'claude/skills'],

  // src/ prefixes claude/src/ ships beyond the shared base: the plugin's hooks
  // run the bundled hook logic through the shared hook and policy runners.
  payload: ['hooks/', 'platforms/shared/'],
};
