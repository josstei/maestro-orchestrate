import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteSync } from '../../lib/io/index.js';
import { ValidationError } from '../../lib/errors/index.js';
import { assertContainedIn } from '../../lib/validation/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';
import { ARCHITECTURE_MEMORY_CATEGORIES, readArchitectureMemory, writeArchitectureMemory } from '../memory/architecture-memory-store.js';
import { appendAgentPerformance, readAgentPerformance } from '../memory/agent-performance-store.js';
import { appendPlanAccuracy, readPlanAccuracy } from '../memory/jsonl-ledgers.js';
import { PROFILE_ARRAY_FIELDS, readProfile, writeProfile } from '../memory/project-profile-store.js';
const MEMORY_PACK_SCHEMA_VERSION = 1;
const MEMORY_PACK_FILENAME = 'memory-pack.json';
/**
 * Resolve the default committable memory-pack artifact path.
 *
 * @param {string} projectRoot
 * @returns {string}
 */
function defaultMemoryPackPath(projectRoot) {
    return path.join(resolveStateDirPath(projectRoot), MEMORY_PACK_FILENAME);
}
/**
 * Resolve an optional memory-pack read path under the resolved state directory.
 *
 * @param {unknown} packPath
 * @param {string} projectRoot
 * @returns {string}
 * @throws {ValidationError}
 */
function resolveMemoryPackPath(packPath, projectRoot) {
    if (packPath == null || packPath === '') {
        return defaultMemoryPackPath(projectRoot);
    }
    if (packPath.includes('\0')) {
        throw new ValidationError('path contains null bytes');
    }
    const stateDir = resolveStateDirPath(projectRoot);
    const resolved = path.isAbsolute(packPath)
        ? path.resolve(packPath)
        : path.resolve(stateDir, packPath);
    assertContainedIn(resolved, stateDir);
    return resolved;
}
/**
 * Build a stable value key for idempotent import comparisons.
 *
 * @param {unknown} value
 * @returns {string}
 */
function stableKey(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableKey(item)).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}
/**
 * Merge imported profile arrays into the current profile.
 *
 * @param {object} current
 * @param {unknown} imported
 * @returns {{ profile: object, counts: object }}
 */
function mergeProfile(current, imported) {
    const source = imported && typeof imported === 'object' ? imported : {};
    const next = { ...current };
    const counts = {};
    for (const field of PROFILE_ARRAY_FIELDS) {
        const values = Array.isArray(next[field]) ? next[field].slice() : [];
        const seen = new Set(values);
        counts[field] = 0;
        for (const item of Array.isArray(source[field]) ? source[field] : []) {
            if (typeof item !== 'string')
                continue;
            const trimmed = item.trim();
            if (trimmed.length === 0 || seen.has(trimmed))
                continue;
            seen.add(trimmed);
            values.push(trimmed);
            counts[field] += 1;
        }
        next[field] = values;
    }
    return { profile: next, counts };
}
/**
 * Return only records not already present in the current record set.
 *
 * @param {object[]} currentRecords
 * @param {unknown} importedRecords
 * @returns {object[]}
 */
function newRecordsByValue(currentRecords, importedRecords) {
    const seen = new Set((Array.isArray(currentRecords) ? currentRecords : []).map((record) => stableKey(record)));
    const out = [];
    for (const record of Array.isArray(importedRecords) ? importedRecords : []) {
        if (!record || typeof record !== 'object' || Array.isArray(record))
            continue;
        const key = stableKey(record);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(record);
    }
    return out;
}
/**
 * Merge imported architecture-memory categories into the current graph.
 *
 * @param {object} current
 * @param {unknown} imported
 * @returns {{ graph: object, counts: object }}
 */
function mergeArchitectureMemory(current, imported) {
    const source = imported && typeof imported === 'object' ? imported : {};
    const next = { ...current };
    const counts = {};
    for (const category of ARCHITECTURE_MEMORY_CATEGORIES) {
        const entries = Array.isArray(next[category]) ? next[category].slice() : [];
        const seen = new Set(entries
            .map((entry) => (entry && typeof entry.value === 'string' ? entry.value : null))
            .filter(Boolean));
        counts[category] = 0;
        for (const entry of Array.isArray(source[category]) ? source[category] : []) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry))
                continue;
            const value = typeof entry.value === 'string' ? entry.value.trim() : '';
            if (value.length === 0 || seen.has(value))
                continue;
            seen.add(value);
            entries.push({
                value,
                session_id: typeof entry.session_id === 'string' && entry.session_id.length > 0
                    ? entry.session_id
                    : null,
            });
            counts[category] += 1;
        }
        next[category] = entries;
    }
    return { graph: next, counts };
}
/**
 * Read the current durable memory stores and write one committable memory pack.
 *
 * @param {object} _params
 * @param {string} projectRoot
 * @returns {{ path: string, pack: object }}
 */
function handleExportMemoryPack(_params, projectRoot) {
    const packPath = defaultMemoryPackPath(projectRoot);
    const pack = {
        schema_version: MEMORY_PACK_SCHEMA_VERSION,
        exported_at: new Date().toISOString(),
        profile: readProfile(projectRoot),
        agent_performance: readAgentPerformance(projectRoot),
        plan_accuracy: readPlanAccuracy(projectRoot),
        architecture_memory: readArchitectureMemory(projectRoot),
    };
    atomicWriteSync(packPath, `${JSON.stringify(pack, null, 2)}\n`);
    return { path: packPath, pack };
}
/**
 * Merge a memory pack back into the existing durable memory stores.
 *
 * @param {{ path?: string }} params
 * @param {string} projectRoot
 * @returns {{ imported: true, counts: object }}
 * @throws {ValidationError}
 */
function handleImportMemoryPack(params, projectRoot) {
    const packPath = resolveMemoryPackPath(params && params.path, projectRoot);
    const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
    if (!pack || typeof pack !== 'object' || Array.isArray(pack)) {
        throw new ValidationError('memory pack must be a JSON object');
    }
    const profileMerge = mergeProfile(readProfile(projectRoot), pack.profile);
    const agentPerformanceRecords = newRecordsByValue(readAgentPerformance(projectRoot).records, pack.agent_performance && pack.agent_performance.records);
    const planAccuracyRecords = newRecordsByValue(readPlanAccuracy(projectRoot), pack.plan_accuracy);
    const architectureMerge = mergeArchitectureMemory(readArchitectureMemory(projectRoot), pack.architecture_memory);
    writeProfile(projectRoot, profileMerge.profile);
    if (agentPerformanceRecords.length > 0) {
        appendAgentPerformance(projectRoot, agentPerformanceRecords);
    }
    for (const record of planAccuracyRecords) {
        appendPlanAccuracy(projectRoot, record);
    }
    writeArchitectureMemory(projectRoot, architectureMerge.graph);
    return {
        imported: true,
        counts: {
            profile: profileMerge.counts,
            agent_performance: agentPerformanceRecords.length,
            plan_accuracy: planAccuracyRecords.length,
            architecture_memory: architectureMerge.counts,
        },
    };
}
export { MEMORY_PACK_SCHEMA_VERSION, handleExportMemoryPack, handleImportMemoryPack, resolveMemoryPackPath };
