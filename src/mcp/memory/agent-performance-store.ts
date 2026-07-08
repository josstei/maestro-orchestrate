import path from 'path';
import { atomicWriteSync, readJsonSafe } from '../../lib/io/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';

const AGENT_PERFORMANCE_SCHEMA_VERSION = 1;
const AGENT_PERFORMANCE_FILENAME = 'agent-performance.json';

function agentPerformancePath(projectRoot: any) {
  return path.join(
    resolveStateDirPath(projectRoot),
    'knowledge',
    AGENT_PERFORMANCE_FILENAME
  );
}

function normalizeAgentPerformanceLedger(ledger: any) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return { schema_version: AGENT_PERFORMANCE_SCHEMA_VERSION, records: [] };
  }
  return {
    schema_version: ledger.schema_version || AGENT_PERFORMANCE_SCHEMA_VERSION,
    records: Array.isArray(ledger.records) ? ledger.records : [],
  };
}

function readAgentPerformance(projectRoot: any) {
  return normalizeAgentPerformanceLedger(readJsonSafe(agentPerformancePath(projectRoot)));
}

function appendAgentPerformance(projectRoot: any, records: any) {
  const incoming = Array.isArray(records) ? records : [];
  const current = readAgentPerformance(projectRoot);
  const next = {
    schema_version:
      current.schema_version || AGENT_PERFORMANCE_SCHEMA_VERSION,
    records: current.records.concat(incoming),
  };
  atomicWriteSync(
    agentPerformancePath(projectRoot),
    `${JSON.stringify(next, null, 2)}\n`
  );
  return next;
}

export { appendAgentPerformance, readAgentPerformance };
