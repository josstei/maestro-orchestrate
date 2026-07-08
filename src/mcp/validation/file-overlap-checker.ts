/**
 * Emit `file_overlap` violations when two phases marked `parallel` at
 * the same dependency depth both declare ownership of the same file.
 * Phases at different depths can safely touch the same file because
 * they run sequentially.
 *
 * Ownership is the union of:
 *   - `files` — the planning-time manifest (canonical plan input)
 *   - `files_created` / `files_modified` — runtime-populated manifests
 *     from previous executions of the plan (included for plans that
 *     were already executed and are being re-validated against updated
 *     rules).
 */
function checkFileOverlap(phases: any, depths: any) {
  const parallelPhases = phases.filter((phase: any) => phase.parallel);
  if (parallelPhases.length === 0) {
    return [];
  }

  const violations = [];
  const batchesByDepth: Record<string, any> = {};

  for (const phase of parallelPhases) {
    const depth = depths[phase.id] || 0;
    batchesByDepth[depth] = batchesByDepth[depth] || [];
    batchesByDepth[depth].push(phase);
  }

  for (const batch of Object.values(batchesByDepth) as any[][]) {
    if (batch.length < 2) {
      continue;
    }

    const fileOwners: Record<string, any> = {};
    for (const phase of batch) {
      const files = [
        ...(phase.files || []),
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

export { checkFileOverlap };
