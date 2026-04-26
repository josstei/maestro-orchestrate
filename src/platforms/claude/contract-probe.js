'use strict';

const { NotCapturedYetError } = require('../shared/contract-probes/not-captured-yet-error');

function probeClaudeContract(payload) {
  if (payload && payload.stub === true) {
    throw new NotCapturedYetError('claude');
  }
  throw new Error(
    'Claude probe: full implementation pending follow-up PR feat/claude-contract-probe'
  );
}

module.exports = { probeClaudeContract, NotCapturedYetError };
