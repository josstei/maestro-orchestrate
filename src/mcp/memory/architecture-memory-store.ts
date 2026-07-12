import path from 'path';
import { atomicWriteSync, readJsonSafe } from '../../lib/io/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';

const ARCHITECTURE_MEMORY_SCHEMA_VERSION = 1;
const ARCHITECTURE_MEMORY_FILENAME = 'architecture-memory.json';

const ARCHITECTURE_MEMORY_CATEGORIES = Object.freeze([
  'interfaces',
  'patterns',
  'integration_points',
  'assumptions',
  'warnings',
]);

function architectureMemoryPath(projectRoot: any) {
  return path.join(
    resolveStateDirPath(projectRoot),
    'knowledge',
    ARCHITECTURE_MEMORY_FILENAME
  );
}

function emptyArchitectureMemoryGraph() {
  const graph: Record<string, any> = { schema_version: ARCHITECTURE_MEMORY_SCHEMA_VERSION };
  for (const category of ARCHITECTURE_MEMORY_CATEGORIES) {
    graph[category] = [];
  }
  return graph;
}

function normalizeArchitectureMemoryEntry(entry: any) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }
  const value = typeof entry.value === 'string' ? entry.value.trim() : '';
  if (value.length === 0) {
    return null;
  }
  const sessionId =
    typeof entry.session_id === 'string' && entry.session_id.length > 0
      ? entry.session_id
      : null;
  return { value, session_id: sessionId };
}

function normalizeArchitectureMemoryGraph(graph: any) {
  const next = emptyArchitectureMemoryGraph();
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return next;
  }
  next.schema_version =
    Number(graph.schema_version) || ARCHITECTURE_MEMORY_SCHEMA_VERSION;
  for (const category of ARCHITECTURE_MEMORY_CATEGORIES) {
    const seen = new Set();
    const entries = Array.isArray(graph[category]) ? graph[category] : [];
    for (const entry of entries) {
      const normalized = normalizeArchitectureMemoryEntry(entry);
      if (!normalized || seen.has(normalized.value)) continue;
      seen.add(normalized.value);
      next[category].push(normalized);
    }
  }
  return next;
}

function readArchitectureMemory(projectRoot: any) {
  return normalizeArchitectureMemoryGraph(readJsonSafe(architectureMemoryPath(projectRoot)));
}

function writeArchitectureMemory(projectRoot: any, graph: any) {
  const next = normalizeArchitectureMemoryGraph(graph);
  atomicWriteSync(
    architectureMemoryPath(projectRoot),
    `${JSON.stringify(next, null, 2)}\n`
  );
  return next;
}

export {
  ARCHITECTURE_MEMORY_CATEGORIES,
  ARCHITECTURE_MEMORY_SCHEMA_VERSION,
  emptyArchitectureMemoryGraph,
  readArchitectureMemory,
  writeArchitectureMemory,
};
