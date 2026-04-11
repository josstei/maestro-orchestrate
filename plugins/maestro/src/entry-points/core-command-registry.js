'use strict';

module.exports = [
  {
    name: 'orchestrate',
    description:
      'Run the full Maestro workflow for complex engineering tasks that need a mandatory design dialogue, approved implementation plan, and then execution with shared session state',
    preload: ['orchestration-steps'],
    firstLine: 'Activate Maestro orchestration mode for the following task:',
    requestType: 'task description',
    executeInstructions:
      'Follow the returned step sequence exactly. The steps are the sole procedural authority — do not improvise, skip, or reorder them.',
  },
  {
    name: 'execute',
    description:
      'Execute an approved Maestro implementation plan using the shared session-state contract',
    preload: ['execution', 'delegation', 'session-management', 'validation'],
    firstLine:
      'Execute an existing implementation plan directly, skipping the design dialogue and planning phases.',
    requestType: 'file path',
    executeInstructions:
      'Read the approved implementation plan at the user-provided path (or check `docs/maestro/plans/` for the most recent plan). Resolve the execution mode gate, create or resume session state, then execute phases through child agents following the loaded methodology.',
  },
  {
    name: 'resume',
    description:
      'Resume an interrupted Maestro session using the existing active-session file and shared phase tracking',
    preload: ['session-management', 'execution', 'delegation', 'validation'],
    firstLine: 'Resume the Maestro orchestration session.',
    requestType: 'additional context',
    executeInstructions:
      'Read the active session state, summarize completed and pending phases, then resume from the first pending or failed phase following the loaded methodology.',
    geminiSessionStateInjection: true,
  },
];
