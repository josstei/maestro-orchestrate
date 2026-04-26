'use strict';

const { NotCapturedYetError } = require('../shared/contract-probes/not-captured-yet-error');

function probeQwenContract(payload) {
  if (payload && payload.stub === true) {
    throw new NotCapturedYetError('qwen');
  }
  throw new Error(
    'Qwen probe: full implementation pending follow-up PR feat/qwen-contract-probe'
  );
}

module.exports = { probeQwenContract, NotCapturedYetError };
