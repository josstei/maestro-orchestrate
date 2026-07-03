'use strict';

const { MemoryStore, PROFILE_ARRAY_FIELDS } = require('../memory/memory-store');

/**
 * Read the durable per-repo memory profile.
 * @param {object} _params
 * @param {string} projectRoot
 * @returns {{ profile: object }}
 */
function handleGetProjectProfile(_params, projectRoot) {
  const store = MemoryStore.forProjectRoot(projectRoot);
  return { profile: store.readProfile() };
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
  const store = MemoryStore.forProjectRoot(projectRoot);
  const current = store.readProfile();
  const source = params && typeof params === 'object' ? params : {};
  for (const field of PROFILE_ARRAY_FIELDS) {
    if (Array.isArray(source[field])) {
      current[field] = source[field];
    }
  }
  return { profile: store.writeProfile(current) };
}

module.exports = {
  handleGetProjectProfile,
  handleUpdateProjectProfile,
};
