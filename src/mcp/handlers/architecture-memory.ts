import { ARCHITECTURE_MEMORY_CATEGORIES, MemoryStore } from '../memory/memory-store.js';
import { normalizeDownstreamContext } from '../contracts/downstream-context.js';

const DOWNSTREAM_CATEGORY_MAP: Record<string, string> = Object.freeze({
  key_interfaces_introduced: 'interfaces',
  patterns_established: 'patterns',
  integration_points: 'integration_points',
  assumptions: 'assumptions',
  warnings: 'warnings',
});

/**
 * Normalize a query value to a trimmed non-empty string or null.
 *
 * @param {unknown} query
 * @returns {string | null}
 */
function normalizeQuery(query: any) {
  if (typeof query !== 'string') return null;
  const trimmed = query.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Append unseen values to a graph category, preserving first-seen provenance.
 *
 * @param {object} graph
 * @param {string} category
 * @param {string[]} values
 * @param {string | null} sessionId
 */
function appendCategoryValues(graph: any, category: any, values: any, sessionId: any) {
  const entries = Array.isArray(graph[category]) ? graph[category] : [];
  const seen = new Set(entries.map((entry: any) => entry.value));
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    entries.push({ value: trimmed, session_id: sessionId });
  }
  graph[category] = entries;
}

/**
 * Fold every phase's downstream context into the durable architecture-memory
 * graph. Entries are de-duped by value within each category and carry the
 * session id that first introduced the value.
 *
 * @param {{ session_id?: string, phases?: Array<object> }} state
 * @param {string} projectRoot
 * @returns {object} the persisted architecture-memory graph
 */
function recordArchitectureMemory(state: any, projectRoot: any) {
  const store = new MemoryStore(projectRoot);
  const graph = store.readArchitectureMemory();
  const sessionId =
    state && typeof state.session_id === 'string' && state.session_id.length > 0
      ? state.session_id
      : null;
  const phases = Array.isArray(state && state.phases) ? state.phases : [];

  for (const phase of phases) {
    const context = normalizeDownstreamContext(
      phase && phase.downstream_context
    );
    for (const [sourceField, category] of Object.entries(DOWNSTREAM_CATEGORY_MAP)) {
      appendCategoryValues(graph, category, context[sourceField], sessionId);
    }
  }

  return store.writeArchitectureMemory(graph);
}

/**
 * Return a queryable view of the durable architecture-memory graph. A query
 * narrows each category by case-insensitive substring match against `value`;
 * absence of a query returns all category entries.
 *
 * @param {{ query?: string }} params
 * @param {string} projectRoot
 * @returns {{ query: string | null, interfaces: object[], patterns: object[], integration_points: object[], assumptions: object[], warnings: object[] }}
 */
function handleQueryArchitectureMemory(params: any, projectRoot: any) {
  const graph = new MemoryStore(projectRoot).readArchitectureMemory();
  const query = normalizeQuery(params && params.query);
  const needle = query ? query.toLowerCase() : null;
  const response: Record<string, any> = { query };

  for (const category of ARCHITECTURE_MEMORY_CATEGORIES) {
    const entries = Array.isArray(graph[category]) ? graph[category] : [];
    response[category] = needle
      ? entries.filter((entry: any) => entry.value.toLowerCase().includes(needle))
      : entries;
  }

  return response;
}

export { recordArchitectureMemory, handleQueryArchitectureMemory };
