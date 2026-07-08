/**
 * Canonical per-agent cost ledger contract.
 *
 * The `token_usage.by_agent` map in session state stores one bucket per agent.
 * This module is the single source of truth for that bucket shape and the
 * attribution / merge / summarize math, used by the writer (`transition_phase`)
 * and the reader (`get_cost_insights`). Pure: no imports, no I/O.
 */
const TOKEN_FIELDS = Object.freeze(['input', 'output', 'cached']);
/**
 * @returns {{ input:number, output:number, cached:number, phases:number, duration_ms:number }}
 */
function createAgentBucket() {
    return { input: 0, output: 0, cached: 0, phases: 0, duration_ms: 0 };
}
/**
 * Coerce a caller-supplied token payload to non-negative finite integers.
 * Missing, negative, or non-finite fields become 0.
 *
 * @param {unknown} tokenUsage
 * @returns {{ input:number, output:number, cached:number }}
 */
function normalizeTokenUsage(tokenUsage) {
    const source = tokenUsage && typeof tokenUsage === 'object' && !Array.isArray(tokenUsage)
        ? tokenUsage
        : {};
    const normalized = {};
    for (const field of TOKEN_FIELDS) {
        const value = Number(source[field]);
        normalized[field] = Number.isFinite(value) && value > 0 ? value : 0;
    }
    return normalized;
}
/**
 * Elapsed milliseconds between two ISO timestamps. Inverted, equal, or
 * unparseable ranges clamp to 0 (never NaN or negative).
 *
 * @param {string} started
 * @param {string} completed
 * @returns {number}
 */
function phaseDurationMs(started, completed) {
    const startMs = Date.parse(started);
    const endMs = Date.parse(completed);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
        return 0;
    }
    return endMs - startMs;
}
/**
 * Attribute one completed phase's token usage and elapsed time to its agent.
 * Mutates and returns `byAgent`. A missing agent name is recorded under
 * `unassigned` so cost is never silently dropped.
 *
 * @param {Record<string, object>} byAgent
 * @param {{ agent?: string, tokenUsage?: unknown, durationMs?: number }} entry
 * @returns {Record<string, object>}
 */
function attributePhaseCost(byAgent, { agent, tokenUsage, durationMs } = {}) {
    const ledger = byAgent && typeof byAgent === 'object' ? byAgent : {};
    const key = typeof agent === 'string' && agent.length > 0 ? agent : 'unassigned';
    const bucket = ledger[key] || createAgentBucket();
    const tokens = normalizeTokenUsage(tokenUsage);
    bucket.input += tokens.input;
    bucket.output += tokens.output;
    bucket.cached += tokens.cached;
    bucket.phases += 1;
    bucket.duration_ms +=
        Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
    ledger[key] = bucket;
    return ledger;
}
/**
 * Add every bucket in `source` into `target`. Mutates and returns `target`.
 *
 * @param {Record<string, object>} target
 * @param {Record<string, object>} source
 * @returns {Record<string, object>}
 */
function mergeAgentLedgers(target, source) {
    const merged = target && typeof target === 'object' ? target : {};
    const incoming = source && typeof source === 'object' ? source : {};
    for (const [agent, bucket] of Object.entries(incoming)) {
        if (!bucket || typeof bucket !== 'object')
            continue;
        const current = merged[agent] || createAgentBucket();
        current.input += Number(bucket.input) || 0;
        current.output += Number(bucket.output) || 0;
        current.cached += Number(bucket.cached) || 0;
        current.phases += Number(bucket.phases) || 0;
        current.duration_ms += Number(bucket.duration_ms) || 0;
        merged[agent] = current;
    }
    return merged;
}
/**
 * Reduce a ledger to grand totals plus a per-agent view with average phase
 * latency.
 *
 * @param {Record<string, object>} byAgent
 * @returns {{ totals: object, by_agent: Record<string, object> }}
 */
function summarizeLedger(byAgent) {
    const ledger = byAgent && typeof byAgent === 'object' ? byAgent : {};
    const totals = { input: 0, output: 0, cached: 0, phases: 0, duration_ms: 0 };
    const perAgent = {};
    for (const [agent, bucket] of Object.entries(ledger)) {
        if (!bucket || typeof bucket !== 'object')
            continue;
        const input = Number(bucket.input) || 0;
        const output = Number(bucket.output) || 0;
        const cached = Number(bucket.cached) || 0;
        const phases = Number(bucket.phases) || 0;
        const duration = Number(bucket.duration_ms) || 0;
        totals.input += input;
        totals.output += output;
        totals.cached += cached;
        totals.phases += phases;
        totals.duration_ms += duration;
        perAgent[agent] = {
            input,
            output,
            cached,
            phases,
            duration_ms: duration,
            avg_duration_ms: phases > 0 ? Math.round(duration / phases) : 0,
        };
    }
    return { totals, by_agent: perAgent };
}
export { TOKEN_FIELDS, createAgentBucket, normalizeTokenUsage, phaseDurationMs, attributePhaseCost, mergeAgentLedgers, summarizeLedger };
