import fs from 'fs';
import path from 'path';
import * as markdownState from '../../core/markdown-state.js';
import { atomicWriteSync, readFileSafe, readJsonSafe } from '../../lib/io/index.js';
import { ValidationError } from '../../lib/errors/index.js';
import { assertRelativePath, normalizeUniqueStringList } from '../../lib/validation/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';
const PROFILE_SCHEMA_VERSION = 1;
const AGENT_PERFORMANCE_SCHEMA_VERSION = 1;
const AGENT_PERFORMANCE_FILENAME = 'agent-performance.json';
const ARCHITECTURE_MEMORY_SCHEMA_VERSION = 1;
const ARCHITECTURE_MEMORY_FILENAME = 'architecture-memory.json';
const ARCHITECTURE_MEMORY_CATEGORIES = Object.freeze([
    'interfaces',
    'patterns',
    'integration_points',
    'assumptions',
    'warnings',
]);
const PROFILE_ARRAY_FIELDS = Object.freeze([
    'build_commands',
    'test_commands',
    'lint_commands',
    'conventions',
    'do_not_touch',
    'preferred_agents',
    'blocked_agents',
]);
const PROFILE_BODY = '# Project Memory Profile\n';
/**
 * @returns {{now: () => Date}} a clock backed by the real wall-clock
 */
function createSystemClock() {
    return { now: () => new Date() };
}
/**
 * Absolute path to a durable knowledge ledger file under `<state_dir>/knowledge/`.
 *
 * @param {string} projectRoot
 * @param {string} filename
 * @returns {string}
 */
function knowledgeFilePath(projectRoot, filename) {
    return path.join(resolveStateDirPath(projectRoot), 'knowledge', filename);
}
/**
 * Validate a value as one safe filesystem path segment for agent memory files.
 *
 * @param {unknown} agent
 * @returns {string}
 * @throws {ValidationError}
 */
function assertAgentMemorySegment(agent) {
    if (typeof agent !== 'string' || agent.length === 0) {
        throw new ValidationError('agent must be a non-empty filesystem segment');
    }
    assertRelativePath(agent);
    if (agent.includes('/') ||
        agent.includes('\\') ||
        agent === '.' ||
        agent === '..') {
        throw new ValidationError('agent must be a single filesystem segment', {
            details: { value: agent },
        });
    }
    return agent;
}
/**
 * Normalize any parsed ledger value into the current wrapped ledger shape.
 *
 * @param {unknown} ledger
 * @returns {{ schema_version: number, records: Array<object> }}
 */
function normalizeAgentPerformanceLedger(ledger) {
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
        return { schema_version: AGENT_PERFORMANCE_SCHEMA_VERSION, records: [] };
    }
    return {
        schema_version: ledger.schema_version || AGENT_PERFORMANCE_SCHEMA_VERSION,
        records: Array.isArray(ledger.records) ? ledger.records : [],
    };
}
/**
 * Build a fresh, empty architecture-memory graph.
 * @returns {{ schema_version: number, interfaces: object[], patterns: object[], integration_points: object[], assumptions: object[], warnings: object[] }}
 */
function emptyArchitectureMemoryGraph() {
    const graph = { schema_version: ARCHITECTURE_MEMORY_SCHEMA_VERSION };
    for (const category of ARCHITECTURE_MEMORY_CATEGORIES) {
        graph[category] = [];
    }
    return graph;
}
/**
 * Normalize one architecture-memory entry to the durable `{ value, session_id }`
 * shape. Invalid or empty values are dropped by returning null.
 *
 * @param {unknown} entry
 * @returns {{ value: string, session_id: string | null } | null}
 */
function normalizeArchitectureMemoryEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
    }
    const value = typeof entry.value === 'string' ? entry.value.trim() : '';
    if (value.length === 0) {
        return null;
    }
    const sessionId = typeof entry.session_id === 'string' && entry.session_id.length > 0
        ? entry.session_id
        : null;
    return { value, session_id: sessionId };
}
/**
 * Normalize any parsed architecture-memory value into the current structured
 * graph shape, de-duping each category by `value` while preserving first-seen
 * provenance.
 *
 * @param {unknown} graph
 * @returns {{ schema_version: number, interfaces: object[], patterns: object[], integration_points: object[], assumptions: object[], warnings: object[] }}
 */
function normalizeArchitectureMemoryGraph(graph) {
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
            if (!normalized || seen.has(normalized.value))
                continue;
            seen.add(normalized.value);
            next[category].push(normalized);
        }
    }
    return next;
}
/**
 * Build a fresh, empty profile at the current schema version.
 * @returns {object}
 */
function emptyProfile() {
    const profile = { schema_version: PROFILE_SCHEMA_VERSION };
    for (const field of PROFILE_ARRAY_FIELDS) {
        profile[field] = [];
    }
    profile.updated = null;
    return profile;
}
const normalizeStringArray = normalizeUniqueStringList;
/**
 * Fold newly-recorded commands into an existing command array, most-recent-first:
 * incoming commands take the head slots (in given order) and any prior command
 * that is not re-recorded is retained after them in its prior order.
 *
 * @param {unknown} existing
 * @param {unknown} incoming
 * @returns {string[]}
 */
function foldCommands(existing, incoming) {
    const incomingClean = normalizeStringArray(incoming);
    const incomingSet = new Set(incomingClean);
    const retained = normalizeStringArray(existing).filter((command) => !incomingSet.has(command));
    return [...incomingClean, ...retained];
}
/**
 * Fold known-good validation commands into a project profile's command arrays,
 * de-duplicated and ordered most-recent-first. Pure: returns a new profile and
 * mutates nothing.
 *
 * @param {object} profile - a project profile object
 * @param {{ build?: string[], test?: string[], lint?: string[] }} incoming
 * @returns {object} a new profile with merged *_commands arrays and refreshed `updated`
 */
function mergeValidationCommands(profile, incoming) {
    const base = profile && typeof profile === 'object' ? profile : {};
    const source = incoming && typeof incoming === 'object' ? incoming : {};
    return {
        ...base,
        build_commands: foldCommands(base.build_commands, source.build),
        test_commands: foldCommands(base.test_commands, source.test),
        lint_commands: foldCommands(base.lint_commands, source.lint),
        updated: new Date().toISOString(),
    };
}
/**
 * Facade over the durable, out-of-session memory files that still need
 * structured read/modify/write behavior: project profiles, agent performance,
 * architecture memory, and per-agent notes. Append-only JSONL ledgers live in
 * `jsonl-ledgers.ts`.
 */
class MemoryStore {
    projectRoot;
    stateDir;
    clock;
    /**
     * @param {string} projectRoot - project root used to resolve the state directory
     * @param {{clock?: {now: () => Date}}} [options] - injected clock, defaults to the real wall-clock
     */
    constructor(projectRoot, { clock = createSystemClock() } = {}) {
        this.projectRoot = projectRoot;
        this.stateDir = resolveStateDirPath(projectRoot);
        this.clock = clock;
    }
    /**
     * @param {string} projectRoot
     * @param {{clock?: {now: () => Date}}} [options]
     * @returns {MemoryStore}
     */
    static forProjectRoot(projectRoot, options) {
        return new MemoryStore(projectRoot, options);
    }
    /**
     * @returns {string}
     */
    profilePath() {
        return path.join(this.stateDir, 'memory', 'project-profile.md');
    }
    /**
     * @returns {string}
     */
    agentPerformancePath() {
        return knowledgeFilePath(this.projectRoot, AGENT_PERFORMANCE_FILENAME);
    }
    /**
     * @returns {string}
     */
    architectureMemoryPath() {
        return knowledgeFilePath(this.projectRoot, ARCHITECTURE_MEMORY_FILENAME);
    }
    /**
     * @param {string} agent
     * @returns {string}
     * @throws {ValidationError}
     */
    agentMemoryPath(agent) {
        const segment = assertAgentMemorySegment(agent);
        return path.join(this.stateDir, 'knowledge', 'agent-memory', `${segment}.md`);
    }
    /**
     * Read the per-repo profile, returning a fresh empty profile when the file is
     * absent or unparseable. Array fields are normalized on read.
     * @returns {object}
     */
    readProfile() {
        let content;
        try {
            content = fs.readFileSync(this.profilePath(), 'utf8');
        }
        catch {
            return emptyProfile();
        }
        let data;
        try {
            data = markdownState.parse(content).data;
        }
        catch {
            return emptyProfile();
        }
        const profile = emptyProfile();
        profile.schema_version = PROFILE_SCHEMA_VERSION;
        for (const field of PROFILE_ARRAY_FIELDS) {
            profile[field] = normalizeStringArray(data[field]);
        }
        profile.updated = typeof data.updated === 'string' ? data.updated : null;
        return profile;
    }
    /**
     * Normalize, stamp (`schema_version` + `updated`), and atomically persist the
     * profile. Returns the canonical profile that was written.
     * @param {object} profile
     * @returns {object}
     */
    writeProfile(profile) {
        const source = profile && typeof profile === 'object' ? profile : {};
        const next = { schema_version: PROFILE_SCHEMA_VERSION };
        for (const field of PROFILE_ARRAY_FIELDS) {
            next[field] = normalizeStringArray(source[field]);
        }
        next.updated = this.clock.now().toISOString();
        atomicWriteSync(this.profilePath(), markdownState.serialize(next, PROFILE_BODY));
        return next;
    }
    /**
     * Read the durable per-agent outcome ledger. Returns an empty ledger when the
     * file is absent or unreadable (never throws).
     *
     * @returns {{ schema_version: number, records: Array<object> }}
     */
    readAgentPerformance() {
        return normalizeAgentPerformanceLedger(readJsonSafe(this.agentPerformancePath()));
    }
    /**
     * Read the structured per-project architecture-memory graph. Returns a fresh
     * zeroed graph when the file is absent, unreadable, or malformed.
     *
     * @returns {{ schema_version: number, interfaces: object[], patterns: object[], integration_points: object[], assumptions: object[], warnings: object[] }}
     */
    readArchitectureMemory() {
        return normalizeArchitectureMemoryGraph(readJsonSafe(this.architectureMemoryPath()));
    }
    /**
     * Read durable memory notes for one agent.
     *
     * @param {string} agent
     * @returns {string}
     * @throws {ValidationError}
     */
    readAgentMemory(agent) {
        return readFileSafe(this.agentMemoryPath(agent), '');
    }
    /**
     * Append one plain-text note to an agent's durable memory file.
     *
     * @param {string} agent
     * @param {string} note
     * @returns {string} the appended note line
     * @throws {ValidationError}
     */
    appendAgentMemory(agent, note) {
        if (typeof note !== 'string' || note.length === 0) {
            throw new ValidationError('note must be a non-empty string');
        }
        const filePath = this.agentMemoryPath(agent);
        const line = note.endsWith('\n') ? note : `${note}\n`;
        atomicWriteSync(filePath, `${readFileSafe(filePath, '')}${line}`);
        return line;
    }
    /**
     * Atomically persist the structured architecture-memory graph.
     *
     * @param {object} graph
     * @returns {{ schema_version: number, interfaces: object[], patterns: object[], integration_points: object[], assumptions: object[], warnings: object[] }}
     */
    writeArchitectureMemory(graph) {
        const next = normalizeArchitectureMemoryGraph(graph);
        atomicWriteSync(this.architectureMemoryPath(), `${JSON.stringify(next, null, 2)}\n`);
        return next;
    }
    /**
     * Append per-agent outcome records to the durable ledger, preserving prior
     * records. A non-array payload is treated as no-op input.
     *
     * @param {Array<object>} records
     * @returns {{ schema_version: number, records: Array<object> }}
     */
    appendAgentPerformance(records) {
        const incoming = Array.isArray(records) ? records : [];
        const current = this.readAgentPerformance();
        const next = {
            schema_version: current.schema_version || AGENT_PERFORMANCE_SCHEMA_VERSION,
            records: current.records.concat(incoming),
        };
        atomicWriteSync(this.agentPerformancePath(), `${JSON.stringify(next, null, 2)}\n`);
        return next;
    }
}
export { MemoryStore, PROFILE_SCHEMA_VERSION, ARCHITECTURE_MEMORY_CATEGORIES, ARCHITECTURE_MEMORY_SCHEMA_VERSION, PROFILE_ARRAY_FIELDS, assertAgentMemorySegment, createSystemClock, emptyArchitectureMemoryGraph, emptyProfile, mergeValidationCommands };
