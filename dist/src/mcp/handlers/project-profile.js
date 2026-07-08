import { PROFILE_ARRAY_FIELDS, mergeValidationCommands, readProfile, writeProfile, } from '../memory/project-profile-store.js';
/**
 * Read the durable per-repo memory profile.
 * @param {object} _params
 * @param {string} projectRoot
 * @returns {{ profile: object }}
 */
function handleGetProjectProfile(_params, projectRoot) {
    return { profile: readProfile(projectRoot) };
}
/**
 * Replace the supplied array fields of the per-repo memory profile and persist
 * it. Omitted fields are preserved from the current profile. Returns the
 * normalized, freshly-stamped profile.
 * @param {object} params
 * @param {string} projectRoot
 * @returns {{ profile: object }}
 */
function handleUpdateProjectProfile(params, projectRoot) {
    const current = readProfile(projectRoot);
    const source = params && typeof params === 'object' ? params : {};
    for (const field of PROFILE_ARRAY_FIELDS) {
        if (Array.isArray(source[field])) {
            current[field] = source[field];
        }
    }
    return { profile: writeProfile(projectRoot, current) };
}
/**
 * Record known-good build/test/lint commands into the per-project memory
 * profile, folding them into the profile command arrays (de-duplicated,
 * most-recent-first) so later runs consult them before heuristics.
 *
 * @param {{ commands?: { build?: string[], test?: string[], lint?: string[] } }} params
 * @param {string} projectRoot
 * @returns {{ profile: object }} the persisted profile (same shape as the sibling profile handlers)
 */
function handleRecordValidationCommands(params, projectRoot) {
    const commands = params && typeof params.commands === 'object' && params.commands !== null
        ? params.commands
        : {};
    const merged = mergeValidationCommands(readProfile(projectRoot), {
        build: commands.build,
        test: commands.test,
        lint: commands.lint,
    });
    return { profile: writeProfile(projectRoot, merged) };
}
export { handleGetProjectProfile, handleUpdateProjectProfile, handleRecordValidationCommands };
