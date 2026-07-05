import { MemoryStore } from '../memory/memory-store.js';
import { normalizeTokenUsage } from '../contracts/agent-cost-ledger.js';
import { aggregateRatings } from './ratings.js';

/**
 * Resolve the primary agent name for a phase, defaulting to `unassigned` so a
 * record is never silently dropped for an agentless phase.
 *
 * @param {{ agents?: string[] }} phase
 * @returns {string}
 */
function phaseAgent(phase) {
  const agents = Array.isArray(phase.agents) ? phase.agents : [];
  const first = agents[0];
  return typeof first === 'string' && first.length > 0 ? first : 'unassigned';
}

/**
 * Project a completed session's phase state into durable per-agent outcome
 * records and append them to `<state_dir>/knowledge/agent-performance.json`.
 * Best-effort math reuses `agent-cost-ledger` normalization for token usage;
 * missing count/duration fields (legacy phases) coerce to 0.
 *
 * @param {{ session_id?: string, phases?: Array<object> }} state
 * @param {string} projectRoot
 * @returns {Array<object>} the records that were appended
 */
function recordAgentPerformance(state, projectRoot) {
  const phases = Array.isArray(state && state.phases) ? state.phases : [];
  const records = phases.map((phase) => ({
    session_id: (state && state.session_id) || null,
    agent: phaseAgent(phase),
    phase_id: phase.id,
    retry_count: Number(phase.retry_count) || 0,
    blocker_count: Number(phase.blocker_count) || 0,
    review_finding_count: Number(phase.review_finding_count) || 0,
    phase_duration_ms: Number(phase.duration_ms) || 0,
    token_usage: normalizeTokenUsage(phase.token_usage),
  }));
  if (records.length > 0) {
    new MemoryStore(projectRoot).appendAgentPerformance(records);
  }
  return records;
}

/**
 * @returns {{ samples:number, total_blockers:number, total_findings:number, total_retries:number, total_duration_ms:number, token_usage:{input:number,output:number,cached:number} }}
 */
function emptyAccumulator() {
  return {
    samples: 0,
    total_blockers: 0,
    total_findings: 0,
    total_retries: 0,
    total_duration_ms: 0,
    token_usage: { input: 0, output: 0, cached: 0 },
  };
}

/**
 * Aggregate the durable ledger into deterministic per-agent priors. Reads the
 * durable `agent-performance.json` (never the token-only archive summaries).
 * Legacy records lacking the new fields contribute 0. Keys are emitted in
 * ascending agent order.
 *
 * @param {{ agent?: string }} params
 * @param {string} projectRoot
 * @returns {{ generated_at:string, agent_count:number, by_agent:Record<string,object>, ratings:object }}
 */
function handleGetAgentPerformance(params, projectRoot) {
  const ledger = new MemoryStore(projectRoot).readAgentPerformance();
  const allRecords = Array.isArray(ledger.records) ? ledger.records : [];
  const filterAgent =
    params && typeof params.agent === 'string' && params.agent.length > 0
      ? params.agent
      : null;

  const accumulators = {};
  for (const record of allRecords) {
    const agent =
      typeof record.agent === 'string' && record.agent.length > 0
        ? record.agent
        : 'unassigned';
    if (filterAgent && agent !== filterAgent) continue;
    const acc = accumulators[agent] || emptyAccumulator();
    acc.samples += 1;
    acc.total_blockers += Number(record.blocker_count) || 0;
    acc.total_findings += Number(record.review_finding_count) || 0;
    acc.total_retries += Number(record.retry_count) || 0;
    acc.total_duration_ms += Number(record.phase_duration_ms) || 0;
    const tokens = normalizeTokenUsage(record.token_usage);
    acc.token_usage.input += tokens.input;
    acc.token_usage.output += tokens.output;
    acc.token_usage.cached += tokens.cached;
    accumulators[agent] = acc;
  }

  const byAgent = {};
  for (const agent of Object.keys(accumulators).sort()) {
    const acc = accumulators[agent];
    const samples = acc.samples;
    byAgent[agent] = {
      samples,
      total_blockers: acc.total_blockers,
      total_findings: acc.total_findings,
      total_retries: acc.total_retries,
      avg_blocker_count: samples > 0 ? acc.total_blockers / samples : 0,
      avg_review_finding_count: samples > 0 ? acc.total_findings / samples : 0,
      avg_retry_count: samples > 0 ? acc.total_retries / samples : 0,
      avg_phase_duration_ms:
        samples > 0 ? Math.round(acc.total_duration_ms / samples) : 0,
      token_usage: acc.token_usage,
    };
  }

  const ratings = aggregateRatings(new MemoryStore(projectRoot).readRatings());

  return {
    generated_at: new Date().toISOString(),
    agent_count: Object.keys(byAgent).length,
    by_agent: byAgent,
    ratings,
  };
}

export { recordAgentPerformance, handleGetAgentPerformance };
