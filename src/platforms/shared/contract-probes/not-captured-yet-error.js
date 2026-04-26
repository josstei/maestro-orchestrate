'use strict';

/**
 * Thrown by per-runtime contract probes when their fixture has not been
 * captured yet. Each runtime's probe receives a stub payload (`{stub: true}`)
 * during the bootstrap phase before its real fixture lands in a follow-up PR.
 */
class NotCapturedYetError extends Error {
  constructor(runtime) {
    super(
      `Runtime contract for '${runtime}' not yet captured. ` +
        `See tests/fixtures/runtime-contracts/${runtime}/README.md for capture procedure.`
    );
    this.code = 'CONTRACT_FIXTURE_MISSING';
    this.runtime = runtime;
  }
}

module.exports = { NotCapturedYetError };
