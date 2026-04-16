'use strict';

/**
 * Emit `file_overlap` violations when two phases marked `parallel` at
 * the same dependency depth both declare the same file in
 * `files_created` or `files_modified`. Phases at different depths can
 * safely touch the same file because they run sequentially.
 */
function checkFileOverlap(phases, depths) {
  const parallelPhases = phases.filter((phase) => phase.parallel);
  if (parallelPhases.length === 0) {
    return [];
  }

  const violations = [];
  const batchesByDepth = {};

  for (const phase of parallelPhases) {
    const depth = depths[phase.id] || 0;
    batchesByDepth[depth] = batchesByDepth[depth] || [];
    batchesByDepth[depth].push(phase);
  }

  for (const batch of Object.values(batchesByDepth)) {
    if (batch.length < 2) {
      continue;
    }

    const fileOwners = {};
    for (const phase of batch) {
      const files = [
        ...(phase.files_created || []),
        ...(phase.files_modified || []),
      ];

      for (const file of files) {
        if (fileOwners[file]) {
          violations.push({
            rule: 'file_overlap',
            detail: `Parallel phases ${fileOwners[file]} and ${phase.id} both touch "${file}"`,
            severity: 'error',
          });
        } else {
          fileOwners[file] = phase.id;
        }
      }
    }
  }

  return violations;
}

module.exports = {
  checkFileOverlap,
};
