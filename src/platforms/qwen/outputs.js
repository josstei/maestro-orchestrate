'use strict';

/**
 * What the generator writes for Qwen Code. Build-time only: scripts/generate.js
 * reads it, and no detached payload ships it.
 */
module.exports = {
  // The repo root is Qwen Code's extension dir: agent stubs in agents/, TOML
  // commands in commands/maestro/.
  ownedDirs: ['agents', 'commands'],

  // No detached payload: the extension dir is the repo root, which already
  // holds src/.
  payload: null,
};
