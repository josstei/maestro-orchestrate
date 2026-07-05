import { defineToolPack } from '../contracts.js';

import {
  handleGetProjectProfile,
  handleUpdateProjectProfile,
  handleRecordValidationCommands,
} from '../../handlers/project-profile.js';

import { handleGetAgentPerformance } from '../../handlers/agent-performance.js';
import { handleGetPlanAccuracy } from '../../handlers/plan-accuracy.js';
import { handleQueryArchitectureMemory } from '../../handlers/architecture-memory.js';
import { handleAppendAgentMemory, handleGetAgentMemory } from '../../handlers/agent-memory.js';
import { handleCompactArchive } from '../../handlers/archive-compaction.js';
import { handleRecallSimilarSessions } from '../../handlers/recall.js';
import { handleRatePhase, handleRateSession } from '../../handlers/ratings.js';
import { handleQueryKnowledge, handleRecordKnowledge } from '../../handlers/org-knowledge.js';
import { handleExportMemoryPack, handleImportMemoryPack } from '../../handlers/memory-pack.js';
const PROFILE_FIELD_SCHEMA = { type: 'array', items: { type: 'string' } };

function createToolPack() {
  return defineToolPack({
    name: 'memory',
    tools: [
      {
        name: 'get_project_profile',
        description:
          'Read the durable per-repo memory profile: learned build/test/lint commands, conventions, do-not-touch paths, and preferred/blocked agents accumulated across sessions. Returns { profile }.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'update_project_profile',
        description:
          'Replace the supplied array fields of the durable per-repo memory profile and persist it. Only fields provided are replaced; omitted fields are preserved. Returns the normalized { profile }.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            build_commands: PROFILE_FIELD_SCHEMA,
            test_commands: PROFILE_FIELD_SCHEMA,
            lint_commands: PROFILE_FIELD_SCHEMA,
            conventions: PROFILE_FIELD_SCHEMA,
            do_not_touch: PROFILE_FIELD_SCHEMA,
            preferred_agents: PROFILE_FIELD_SCHEMA,
            blocked_agents: PROFILE_FIELD_SCHEMA,
          },
        },
      },
      {
        name: 'record_validation_commands',
        description:
          'Record known-good build/test/lint commands verified during a session into the per-project memory profile. Commands are folded into the profile command arrays de-duplicated and most-recent-first, so later runs consult them before falling back to project-type heuristics.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            commands: {
              type: 'object',
              properties: {
                build: { type: 'array', items: { type: 'string' } },
                test: { type: 'array', items: { type: 'string' } },
                lint: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['commands'],
        },
      },
      {
        name: 'get_agent_performance',
        description:
          'Aggregate per-agent priors (blocker/finding/retry rates, average phase latency, token usage) from the durable knowledge/agent-performance.json ledger. Set agent to narrow to one agent. Returns empty priors when the ledger is absent.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              description:
                'Optional agent name to narrow the priors to a single agent.',
            },
          },
        },
      },
      {
        name: 'recall_similar_sessions',
        description:
          'Rank the most relevant prior archived sessions for a free-text task description using a deterministic BM25/TF-IDF scan of the archived corpus (task, agents, touched files, recorded warnings). Results are ordered by score descending, ties broken by session_id ascending, each with a rationale naming the agents that handled similar work, contended file areas, and recorded warnings.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Free-text task description to match against archived sessions.',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              default: 5,
              description: 'Maximum number of ranked precedents to return.',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'rate_phase',
        description:
          'Record an explicit human-satisfaction rating (thumbs up/down) for a specific phase of a session, with an optional free-text note. Persisted to knowledge/ratings.jsonl and folded into the get_agent_performance priors.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            phase_id: { type: ['integer', 'string'] },
            rating: { type: 'string', enum: ['up', 'down'] },
            note: { type: 'string' },
          },
          required: ['session_id', 'phase_id', 'rating'],
        },
      },
      {
        name: 'rate_session',
        description:
          'Record an explicit human-satisfaction rating (thumbs up/down) for a whole session, with an optional free-text note. Persisted to knowledge/ratings.jsonl and folded into the get_agent_performance priors.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            session_id: { type: 'string' },
            rating: { type: 'string', enum: ['up', 'down'] },
            note: { type: 'string' },
          },
          required: ['session_id', 'rating'],
        },
      },
      {
        name: 'get_plan_accuracy',
        description:
          'Aggregate plan-vs-actual file accuracy from the durable knowledge/plan-accuracy.jsonl ledger. Returns precision/recall averages plus recent records so implementation planning can calibrate phase file ownership.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'query_architecture_memory',
        description:
          'Query the durable per-project architecture-memory graph folded from archived phase downstream_context. Set query for case-insensitive substring matching across interfaces, patterns, integration points, assumptions, and warnings; omit query to return the full graph.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Optional case-insensitive substring to match against architecture-memory entry values.',
            },
          },
        },
      },
      {
        name: 'get_agent_memory',
        description:
          'Read durable per-agent memory notes for the target agent from knowledge/agent-memory/<agent>.md. Returns an empty memory string when no notes exist.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              description: 'Agent identifier to read memory for.',
            },
          },
          required: ['agent'],
        },
      },
      {
        name: 'append_agent_memory',
        description:
          'Append one durable plain-text note to the target agent memory file under knowledge/agent-memory/<agent>.md.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            agent: {
              type: 'string',
              description: 'Agent identifier to append memory for.',
            },
            note: {
              type: 'string',
              description: 'Non-empty memory note to append.',
            },
          },
          required: ['agent', 'note'],
        },
      },
      {
        name: 'compact_archive',
        description:
          'Deterministically prune oldest state/archive/*.md session documents beyond MAESTRO_ARCHIVE_RETENTION. Retention 0 is a no-op and durable knowledge plus checkpoints are preserved.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'record_knowledge',
        description:
          'Record a cross-project knowledge note in MAESTRO_KNOWLEDGE_DIR for future sessions. Topic and note are content, not paths. Do not store secrets; notes may be shared across projects.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            topic: {
              type: 'string',
              description: 'Short topic label for the knowledge note.',
            },
            note: {
              type: 'string',
              description: 'Non-empty note content. Do not store secrets.',
            },
          },
          required: ['topic', 'note'],
        },
      },
      {
        name: 'query_knowledge',
        description:
          'Query cross-project knowledge notes from MAESTRO_KNOWLEDGE_DIR. Stored notes may be shared across projects; do not store secrets.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Optional case-insensitive substring to match against topic or note.',
            },
          },
        },
      },
      {
        name: 'export_memory_pack',
        description:
          'Export the durable project memory profile, agent-performance ledger, plan-accuracy ledger, and architecture-memory graph into one committable memory-pack.json artifact under the Maestro state directory. Volatile memory and knowledge ledgers stay in place.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'import_memory_pack',
        description:
          'Import a committable memory-pack.json artifact from the Maestro state directory and merge it additively into the durable project memory stores without duplicating existing entries.',
        requiresWorkspace: true,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Optional path to a memory pack under the resolved Maestro state directory. Defaults to memory-pack.json.',
            },
          },
        },
      },
    ],
    handlers: {
      get_project_profile: handleGetProjectProfile,
      update_project_profile: handleUpdateProjectProfile,
      record_validation_commands: handleRecordValidationCommands,
      get_agent_performance: handleGetAgentPerformance,
      recall_similar_sessions: handleRecallSimilarSessions,
      rate_phase: handleRatePhase,
      rate_session: handleRateSession,
      get_plan_accuracy: handleGetPlanAccuracy,
      query_architecture_memory: handleQueryArchitectureMemory,
      get_agent_memory: handleGetAgentMemory,
      append_agent_memory: handleAppendAgentMemory,
      compact_archive: handleCompactArchive,
      record_knowledge: handleRecordKnowledge,
      query_knowledge: handleQueryKnowledge,
      export_memory_pack: handleExportMemoryPack,
      import_memory_pack: handleImportMemoryPack,
    },
  });
}

export { createToolPack };
