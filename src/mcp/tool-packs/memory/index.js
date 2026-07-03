'use strict';

const { defineToolPack } = require('../contracts');
const {
  handleGetProjectProfile,
  handleUpdateProjectProfile,
  handleRecordValidationCommands,
} = require('../../handlers/project-profile');
const {
  handleGetAgentPerformance,
} = require('../../handlers/agent-performance');
const { handleGetPlanAccuracy } = require('../../handlers/plan-accuracy');
const {
  handleQueryArchitectureMemory,
} = require('../../handlers/architecture-memory');
const {
  handleAppendAgentMemory,
  handleGetAgentMemory,
} = require('../../handlers/agent-memory');
const { handleRecallSimilarSessions } = require('../../handlers/recall');
const { handleRatePhase, handleRateSession } = require('../../handlers/ratings');

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
    },
  });
}

module.exports = {
  createToolPack,
};
