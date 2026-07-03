'use strict';

const fs = require('fs');
const path = require('path');

const markdownState = require('../../core/markdown-state');
const { resolveBasePath, readActiveSessionOrNull } = require('./session-state-core');
const { mergeAgentLedgers, summarizeLedger } = require('../contracts/agent-cost-ledger');
const { migrateSessionState } = require('./session-migrations');

/**
 * @param {string} basePath
 * @returns {string}
 */
function archiveDir(basePath) {
  return path.join(basePath, 'state', 'archive');
}

/**
 * Derived session outcome: 'failed' if any phase failed, else 'completed'.
 * @param {Array<{status?:string}>} phases
 * @returns {'completed'|'failed'}
 */
function deriveOutcome(phases) {
  const list = Array.isArray(phases) ? phases : [];
  return list.some((phase) => phase && phase.status === 'failed')
    ? 'failed'
    : 'completed';
}

/**
 * @param {Array<{agents?:string[]}>} phases
 * @returns {string[]} sorted unique agent names
 */
function collectAgents(phases) {
  const agents = new Set();
  for (const phase of Array.isArray(phases) ? phases : []) {
    for (const agent of Array.isArray(phase.agents) ? phase.agents : []) {
      if (typeof agent === 'string' && agent.length > 0) {
        agents.add(agent);
      }
    }
  }
  return [...agents].sort();
}

/**
 * @param {object} state - parsed session frontmatter
 * @param {string|null} archivePath - repo-relative archive path (null for active)
 * @returns {object} archive summary
 */
function toSummary(state, archivePath) {
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
    completed_phases: phases.filter((p) => p && p.status === 'completed').length,
    failed_phases: phases.filter((p) => p && p.status === 'failed').length,
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
 * Parse an archived session document and bring it up to the current schema
 * version. Shared by the archive reader and future archived-document consumers
 * so every archive parse site is migration-routed identically to the active
 * read path in `session-state-core.js`.
 *
 * @param {string} content - raw archived session-state file content
 * @returns {object} migrated session-state frontmatter data
 */
function parseArchivedSessionState(content) {
  return migrateSessionState(markdownState.parse(content).data);
}

/**
 * Read every parseable archived session under `state/archive/`, newest first.
 * Returns [] when the archive directory is absent. Unparseable or
 * id-less files are skipped rather than throwing.
 *
 * @param {string} projectRoot
 * @returns {object[]}
 */
function readArchivedSessionSummaries(projectRoot) {
  const basePath = resolveBasePath(projectRoot);
  const dir = archiveDir(basePath);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const summaries = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const absPath = path.join(dir, entry.name);
    let state;
    try {
      state = parseArchivedSessionState(fs.readFileSync(absPath, 'utf8'));
    } catch {
      continue;
    }
    if (!state || typeof state.session_id !== 'string') continue;
    summaries.push(toSummary(state, path.join('state', 'archive', entry.name)));
  }
  summaries.sort(
    (a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0)
  );
  return summaries;
}

/**
 * @param {object} _params
 * @param {string} projectRoot
 */
function handleListArchivedSessions(_params, projectRoot) {
  const sessions = readArchivedSessionSummaries(projectRoot);
  return { count: sessions.length, sessions };
}

/**
 * @param {object} summary
 * @param {{ agent:string|null, outcome:string|null, created_after:string|null, created_before:string|null }} filters
 * @returns {boolean}
 */
function matchesFilters(summary, filters) {
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
function handleSearchArchivedSessions(params, projectRoot) {
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
  const sessions = readArchivedSessionSummaries(projectRoot).filter((summary) =>
    matchesFilters(summary, filters)
  );
  return { count: sessions.length, filters, sessions };
}

/**
 * Deterministic cross-session per-agent token + latency rollup.
 * @param {{ include_active?: boolean }} params
 * @param {string} projectRoot
 */
function handleGetCostInsights(params, projectRoot) {
  const sources = readArchivedSessionSummaries(projectRoot);
  let activeIncluded = false;
  if (params && params.include_active === true) {
    const active = readActiveSessionOrNull(projectRoot);
    if (active && active.state) {
      sources.push(toSummary(active.state, null));
      activeIncluded = true;
    }
  }

  let ledger = {};
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

module.exports = {
  parseArchivedSessionState,
  readArchivedSessionSummaries,
  handleListArchivedSessions,
  handleSearchArchivedSessions,
  handleGetCostInsights,
};
