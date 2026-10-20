'use strict';

/**
 * What the generator writes for Codex. Build-time only: scripts/generate.js
 * reads it, and no detached payload ships it.
 */
module.exports = {
  ownedDirs: ['plugins/maestro/skills'],

  // Codex registers no hooks, so plugins/maestro/src/ ships only the shared base.
  payload: [],
};
