'use strict';

const { ValidationError } = require('../../lib/errors');
const { MemoryStore } = require('../memory/memory-store');

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 * @throws {ValidationError}
 */
function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  return value;
}

/**
 * Return durable memory notes for one agent.
 *
 * @param {{ agent?: string }} params
 * @param {string} projectRoot
 * @returns {{ agent: string, memory: string }}
 * @throws {ValidationError}
 */
function handleGetAgentMemory(params, projectRoot) {
  const agent = requireNonEmptyString(params && params.agent, 'agent');
  return {
    agent,
    memory: new MemoryStore(projectRoot).readAgentMemory(agent),
  };
}

/**
 * Append one durable memory note for an agent.
 *
 * @param {{ agent?: string, note?: string }} params
 * @param {string} projectRoot
 * @returns {{ agent: string, appended: true }}
 * @throws {ValidationError}
 */
function handleAppendAgentMemory(params, projectRoot) {
  const agent = requireNonEmptyString(params && params.agent, 'agent');
  const note = requireNonEmptyString(params && params.note, 'note');
  new MemoryStore(projectRoot).appendAgentMemory(agent, note);
  return { agent, appended: true };
}

module.exports = {
  handleAppendAgentMemory,
  handleGetAgentMemory,
};
