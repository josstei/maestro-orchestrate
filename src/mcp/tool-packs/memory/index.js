'use strict';

const { defineToolPack } = require('../contracts');
const {
  handleGetProjectProfile,
  handleUpdateProjectProfile,
  handleRecordValidationCommands,
} = require('../../handlers/project-profile');

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
    ],
    handlers: {
      get_project_profile: handleGetProjectProfile,
      update_project_profile: handleUpdateProjectProfile,
      record_validation_commands: handleRecordValidationCommands,
    },
  });
}

module.exports = {
  createToolPack,
};
