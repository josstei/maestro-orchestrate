'use strict';

const path = require('node:path');
const { AgentAllocator } = require('../../lib/agent-allocator');
const { loadAgentRoster } = require('../../lib/agent-loader');
const { ValidationError } = require('../../lib/errors');

/**
 * @param {string | undefined} canonicalSrcRoot
 * @returns {string | undefined}
 */
function resolveAgentsDir(canonicalSrcRoot) {
  return canonicalSrcRoot ? path.join(canonicalSrcRoot, 'agents') : undefined;
}

/**
 * @param {string | undefined} canonicalSrcRoot
 * @returns {function({ phase_deliverable: string }): { agent: string, score: number, matched_signals: string[], fell_back: boolean }}
 */
function createHandler(canonicalSrcRoot) {
  const agentsDir = resolveAgentsDir(canonicalSrcRoot);
  return function handleGetAgentRecommendation(params) {
    if (
      !params ||
      typeof params.phase_deliverable !== 'string' ||
      params.phase_deliverable.length === 0
    ) {
      throw new ValidationError(
        'get_agent_recommendation requires phase_deliverable as a non-empty string'
      );
    }
    const roster = loadAgentRoster(agentsDir);
    const allocator = new AgentAllocator(roster);
    return allocator.allocate(params.phase_deliverable);
  };
}

const handleGetAgentRecommendation = createHandler();

module.exports = {
  handleGetAgentRecommendation,
  createHandler,
};
