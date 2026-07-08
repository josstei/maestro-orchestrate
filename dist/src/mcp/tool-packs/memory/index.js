import { defineTool } from '../contracts.js';
import { zodSchemas } from './zod-schemas.js';
import { handleGetProjectProfile, handleUpdateProjectProfile, handleRecordValidationCommands, } from '../../handlers/project-profile.js';
import { handleGetAgentPerformance } from '../../handlers/agent-performance.js';
import { handleGetPlanAccuracy } from '../../handlers/plan-accuracy.js';
import { handleQueryArchitectureMemory } from '../../handlers/architecture-memory.js';
import { handleAppendAgentMemory, handleGetAgentMemory } from '../../handlers/agent-memory.js';
import { handleCompactArchive } from '../../handlers/archive-compaction.js';
import { handleRecallSimilarSessions } from '../../handlers/recall.js';
import { handleRate } from '../../handlers/ratings.js';
import { handleQueryKnowledge, handleRecordKnowledge } from '../../handlers/org-knowledge.js';
import { handleExportMemoryPack, handleImportMemoryPack } from '../../handlers/memory-pack.js';
/**
 * Register the `memory` pack's 15 tools via `defineTool`, each consuming its
 * shape from `./zod-schemas.js`. Every tool in this pack requires an
 * initialized workspace.
 *
 * @param {{server: object, registry: object}} options
 */
function registerMemoryPack({ server, registry, ...contextOptions } = {}) {
    const memoryTools = [
        {
            name: 'get_project_profile',
            description: 'Read the durable per-repo memory profile: learned build/test/lint commands, conventions, do-not-touch paths, and preferred/blocked agents accumulated across sessions. Returns { profile }.',
            handler: handleGetProjectProfile,
        },
        {
            name: 'update_project_profile',
            description: 'Replace the supplied array fields of the durable per-repo memory profile and persist it. Only fields provided are replaced; omitted fields are preserved. Returns the normalized { profile }.',
            handler: handleUpdateProjectProfile,
        },
        {
            name: 'record_validation_commands',
            description: 'Record known-good build/test/lint commands verified during a session into the per-project memory profile. Commands are folded into the profile command arrays de-duplicated and most-recent-first, so later runs consult them before falling back to project-type heuristics.',
            handler: handleRecordValidationCommands,
        },
        {
            name: 'get_agent_performance',
            description: 'Aggregate per-agent priors (blocker/finding/retry rates, average phase latency, token usage) from the durable knowledge/agent-performance.json ledger. Set agent to narrow to one agent. Returns empty priors when the ledger is absent.',
            handler: handleGetAgentPerformance,
        },
        {
            name: 'recall_similar_sessions',
            description: 'Rank the most relevant prior archived sessions for a free-text task description using a deterministic BM25/TF-IDF scan of the archived corpus (task, agents, touched files, recorded warnings). Results are ordered by score descending, ties broken by session_id ascending, each with a rationale naming the agents that handled similar work, contended file areas, and recorded warnings.',
            handler: handleRecallSimilarSessions,
        },
        {
            name: 'rate',
            description: "Record an explicit human-satisfaction rating (thumbs up/down) for a whole session (target: 'session') or a specific phase (target: 'phase', phase_id required), with an optional free-text note. Persisted to knowledge/ratings.jsonl and folded into the get_agent_performance priors.",
            handler: handleRate,
        },
        {
            name: 'get_plan_accuracy',
            description: 'Aggregate plan-vs-actual file accuracy from the durable knowledge/plan-accuracy.jsonl ledger. Returns precision/recall averages plus recent records so implementation planning can calibrate phase file ownership.',
            handler: handleGetPlanAccuracy,
        },
        {
            name: 'query_architecture_memory',
            description: 'Query the durable per-project architecture-memory graph folded from archived phase downstream_context. Set query for case-insensitive substring matching across interfaces, patterns, integration points, assumptions, and warnings; omit query to return the full graph.',
            handler: handleQueryArchitectureMemory,
        },
        {
            name: 'get_agent_memory',
            description: 'Read durable per-agent memory notes for the target agent from knowledge/agent-memory/<agent>.md. Returns an empty memory string when no notes exist.',
            handler: handleGetAgentMemory,
        },
        {
            name: 'append_agent_memory',
            description: 'Append one durable plain-text note to the target agent memory file under knowledge/agent-memory/<agent>.md.',
            handler: handleAppendAgentMemory,
        },
        {
            name: 'compact_archive',
            description: 'Deterministically prune oldest state/archive/*.md session documents beyond MAESTRO_ARCHIVE_RETENTION. Retention 0 is a no-op and durable knowledge plus checkpoints are preserved.',
            handler: handleCompactArchive,
        },
        {
            name: 'record_knowledge',
            description: 'Record a cross-project knowledge note in MAESTRO_KNOWLEDGE_DIR for future sessions. Topic and note are content, not paths. Do not store secrets; notes may be shared across projects.',
            handler: handleRecordKnowledge,
        },
        {
            name: 'query_knowledge',
            description: 'Query cross-project knowledge notes from MAESTRO_KNOWLEDGE_DIR. Stored notes may be shared across projects; do not store secrets.',
            handler: handleQueryKnowledge,
        },
        {
            name: 'export_memory_pack',
            description: 'Export the durable project memory profile, agent-performance ledger, plan-accuracy ledger, and architecture-memory graph into one committable memory-pack.json artifact under the Maestro state directory. Volatile memory and knowledge ledgers stay in place.',
            handler: handleExportMemoryPack,
        },
        {
            name: 'import_memory_pack',
            description: 'Import a committable memory-pack.json artifact from the Maestro state directory and merge it additively into the durable project memory stores without duplicating existing entries.',
            handler: handleImportMemoryPack,
        },
    ];
    for (const tool of memoryTools) {
        defineTool({
            server,
            registry,
            name: tool.name,
            description: tool.description,
            requiresWorkspace: true,
            schema: zodSchemas[tool.name],
            handler: (args, ctx) => tool.handler(args, ctx.projectRoot),
            ...contextOptions,
        });
    }
}
export { registerMemoryPack };
