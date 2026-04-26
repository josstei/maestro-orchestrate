'use strict';

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

function probeClaudeContract(payload) {
  if (payload && payload.stub === true) {
    throw new NotCapturedYetError('claude');
  }
  throw new Error(
    'Claude probe: full implementation pending follow-up PR feat/claude-contract-probe'
  );
}

module.exports = { probeClaudeContract, NotCapturedYetError };
