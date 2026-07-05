const STABLE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
function isStable(version) { return STABLE_SEMVER_RE.test(version); }
export { STABLE_SEMVER_RE, isStable };
