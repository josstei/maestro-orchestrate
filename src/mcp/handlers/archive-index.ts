import path from 'path';
import { mergeAgentLedgers, summarizeLedger } from '../contracts/agent-cost-ledger.js';
import { sessionStore } from '../session/session-store.js';
import {
  parseArchivedSessionState,
  collectAgents,
  mapArchivedSessionStates,
} from './archive-scan.js';

/**
 * Derived session outcome: 'failed' if any phase failed, else 'completed'.
 * @param {Array<{status?:string}>} phases
 * @returns {'completed'|'failed'}
 */
function deriveOutcome(phases: any) {
  const list = Array.isArray(phases) ? phases : [];
  return list.some((phase: any) => phase && phase.status === 'failed')
    ? 'failed'
    : 'completed';
}

/**
 * @param {object} state - parsed session frontmatter
 * @param {string|null} archivePath - repo-relative archive path (null for active)
 * @returns {object} archive summary
 */
function toSummary(state: any, archivePath: any) {
  const phases = Array.isArray(state.phases) ? state.phases : [];
  const tokenUsage =
    state.token_usage && typeof state.token_usage === 'object'
      ? state.token_usage
      : {};
  return {
    session_id: state.session_id,
    task: state.task || null,
    created: state.created || null,
    updated: state.updated || null,
    status: state.status || null,
    outcome: deriveOutcome(phases),
    workflow_mode: state.workflow_mode || null,
    total_phases: phases.length,
    completed_phases: phases.filter((p: any) => p && p.status === 'completed').length,
    failed_phases: phases.filter((p: any) => p && p.status === 'failed').length,
    agents: collectAgents(phases),
    token_usage: {
      total_input: Number(tokenUsage.total_input) || 0,
      total_output: Number(tokenUsage.total_output) || 0,
      total_cached: Number(tokenUsage.total_cached) || 0,
      by_agent:
        tokenUsage.by_agent && typeof tokenUsage.by_agent === 'object'
          ? tokenUsage.by_agent
          : {},
    },
    archive_path: archivePath,
  };
}

/**
 * Read every parseable archived session under `state/archive/`, newest first.
 * Returns [] when the archive directory is absent. Unparseable or
 * id-less files are skipped rather than throwing.
 *
 * @param {string} projectRoot
 * @returns {object[]}
 */
function readArchivedSessionSummaries(projectRoot: any) {
  const summaries = mapArchivedSessionStates(projectRoot, toSummary);
  summaries.sort(
    (a: any, b: any) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0)
  );
  return summaries;
}

/**
 * @param {object} summary
 * @param {{ agent:string|null, outcome:string|null, created_after:string|null, created_before:string|null }} filters
 * @returns {boolean}
 */
function matchesFilters(summary: any, filters: any) {
  if (filters.outcome && summary.outcome !== filters.outcome) return false;
  if (filters.agent) {
    const inAgents = summary.agents.includes(filters.agent);
    const inLedger = Object.prototype.hasOwnProperty.call(
      summary.token_usage.by_agent,
      filters.agent
    );
    if (!inAgents && !inLedger) return false;
  }
  const createdMs = Date.parse(summary.created);
  if (filters.created_after) {
    const afterMs = Date.parse(filters.created_after);
    if (Number.isFinite(afterMs) && !(Number.isFinite(createdMs) && createdMs >= afterMs)) {
      return false;
    }
  }
  if (filters.created_before) {
    const beforeMs = Date.parse(filters.created_before);
    if (Number.isFinite(beforeMs) && !(Number.isFinite(createdMs) && createdMs <= beforeMs)) {
      return false;
    }
  }
  return true;
}

/**
 * @param {object} params
 * @param {string} projectRoot
 */
function handleSearchArchivedSessions(params: any, projectRoot: any) {
  const filters = {
    agent:
      typeof params.agent === 'string' && params.agent.length > 0
        ? params.agent
        : null,
    outcome:
      params.outcome === 'failed' || params.outcome === 'completed'
        ? params.outcome
        : null,
    created_after:
      typeof params.created_after === 'string' ? params.created_after : null,
    created_before:
      typeof params.created_before === 'string' ? params.created_before : null,
  };
  const sessions = readArchivedSessionSummaries(projectRoot).filter((summary: any) =>
    matchesFilters(summary, filters)
  );
  return { count: sessions.length, filters, sessions };
}

/**
 * Deterministic cross-session per-agent token + latency rollup.
 * @param {{ include_active?: boolean }} params
 * @param {string} projectRoot
 */
function handleGetCostInsights(params: any, projectRoot: any) {
  const sources = readArchivedSessionSummaries(projectRoot);
  let activeIncluded = false;
  if (params && params.include_active === true) {
    const active = sessionStore.readOrNull(projectRoot);
    if (active && active.state) {
      sources.push(toSummary(active.state, null));
      activeIncluded = true;
    }
  }

  let ledger: Record<string, any> = {};
  const tokenTotals = { input: 0, output: 0, cached: 0 };
  for (const summary of sources) {
    ledger = mergeAgentLedgers(ledger, summary.token_usage.by_agent);
    tokenTotals.input += summary.token_usage.total_input;
    tokenTotals.output += summary.token_usage.total_output;
    tokenTotals.cached += summary.token_usage.total_cached;
  }
  const { totals: ledgerTotals, by_agent } = summarizeLedger(ledger);

  return {
    generated_at: new Date().toISOString(),
    session_count: sources.length,
    active_included: activeIncluded,
    totals: {
      input: tokenTotals.input,
      output: tokenTotals.output,
      cached: tokenTotals.cached,
      phases: ledgerTotals.phases,
      duration_ms: ledgerTotals.duration_ms,
    },
    latency: {
      total_duration_ms: ledgerTotals.duration_ms,
      avg_phase_duration_ms:
        ledgerTotals.phases > 0
          ? Math.round(ledgerTotals.duration_ms / ledgerTotals.phases)
          : 0,
    },
    by_agent,
  };
}

export { parseArchivedSessionState, readArchivedSessionSummaries, handleSearchArchivedSessions, handleGetCostInsights };
