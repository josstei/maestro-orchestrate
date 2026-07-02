'use strict';
const STABLE_SEMVER_RE = /^\d+\.\d+\.\d+$/;
function isStable(version) { return STABLE_SEMVER_RE.test(version); }
module.exports = { STABLE_SEMVER_RE, isStable };
