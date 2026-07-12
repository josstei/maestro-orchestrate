const STABLE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
function isStable(version: string): boolean { return STABLE_SEMVER_RE.test(version); }
export { STABLE_SEMVER_RE, isStable };
