'use strict';

const { AgentAllocator } = require('../../lib/agent-allocator');
const { loadAgentRoster } = require('../../lib/agent-loader');
const { ValidationError } = require('../../lib/errors');

/**
 * Recommend an agent from the Maestro roster for a phase deliverable.
 * @param {{ phase_deliverable: string }} params
 * @returns {{ agent: string, score: number, matched_signals: string[], fell_back: boolean }}
 */
function handleGetAgentRecommendation(params) {
  if (
    !params ||
    typeof params.phase_deliverable !== 'string' ||
    params.phase_deliverable.length === 0
  ) {
    throw new ValidationError(
      'get_agent_recommendation requires phase_deliverable as a non-empty string'
    );
  }
  const roster = loadAgentRoster();
  const allocator = new AgentAllocator(roster);
  return allocator.allocate(params.phase_deliverable);
}

function createHandler() {
  return handleGetAgentRecommendation;
}

module.exports = {
  handleGetAgentRecommendation,
  createHandler,
};
