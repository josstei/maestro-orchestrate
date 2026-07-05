import { requireNonEmptyString } from '../../lib/validation/index.js';
import { MemoryStore } from '../memory/memory-store.js';

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

export { handleAppendAgentMemory, handleGetAgentMemory };
