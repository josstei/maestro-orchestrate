'use strict';

const { NotCapturedYetError } = require('../shared/contract-probes/not-captured-yet-error');

function probeCodexContract(payload) {
  if (payload && payload.stub === true) {
    throw new NotCapturedYetError('codex');
  }
  throw new Error(
    'Codex probe: full implementation pending follow-up PR feat/codex-contract-probe'
  );
}

module.exports = { probeCodexContract, NotCapturedYetError };
