import { collectAgents, mapArchivedSessionStates } from '../handlers/archive-scan.js';
/**
 * @param {Array<object>} phases
 * @returns {string[]} sorted unique touched file paths
 */
function collectFiles(phases) {
    const files = new Set();
    for (const phase of Array.isArray(phases) ? phases : []) {
        for (const field of ['files_created', 'files_modified', 'files_deleted']) {
            for (const file of Array.isArray(phase[field]) ? phase[field] : []) {
                if (typeof file === 'string' && file.length > 0)
                    files.add(file);
            }
        }
    }
    return [...files].sort();
}
/**
 * @param {Array<{ downstream_context?: { warnings?: unknown } }>} phases
 * @returns {string[]} recorded warnings in phase order
 */
function collectWarnings(phases) {
    const warnings = [];
    for (const phase of Array.isArray(phases) ? phases : []) {
        const context = phase && typeof phase.downstream_context === 'object' && phase.downstream_context
            ? phase.downstream_context
            : {};
        for (const warning of Array.isArray(context.warnings) ? context.warnings : []) {
            if (typeof warning === 'string' && warning.length > 0)
                warnings.push(warning);
        }
    }
    return warnings;
}
/**
 * @param {object} state - migrated session frontmatter
 * @param {string} archivePath - repo-relative archive path
 * @returns {{ session_id: string, text: string, summary: object }}
 */
function toRecord(state, archivePath) {
    const phases = Array.isArray(state.phases) ? state.phases : [];
    const task = typeof state.task === 'string' ? state.task : '';
    const agents = collectAgents(phases);
    const files = collectFiles(phases);
    const warnings = collectWarnings(phases);
    const text = [task, agents.join(' '), files.join(' '), warnings.join(' ')]
        .filter((part) => part.length > 0)
        .join(' ');
    return {
        session_id: state.session_id,
        text,
        summary: {
            session_id: state.session_id,
            task,
            created: typeof state.created === 'string' ? state.created : null,
            agents,
            files,
            warnings,
            archive_path: archivePath,
        },
    };
}
/**
 * Dedicated retrieval-corpus projection over the FULL archived session
 * documents. Reads each `<state_dir>/state/archive/*.md`, routes it through
 * Unit 1's `migrateSessionState`, and projects `task` + agents + touched
 * files + recorded warnings into an indexable record. Does NOT widen
 * `toSummary`/`readArchivedSessionSummaries`. Unparseable or id-less files
 * are skipped rather than throwing. Returns `[]` when the archive is absent.
 *
 * @param {string} projectRoot
 * @returns {Array<{ session_id: string, text: string, summary: object }>}
 */
function buildRetrievalCorpus(projectRoot) {
    return mapArchivedSessionStates(projectRoot, toRecord);
}
export { buildRetrievalCorpus };
