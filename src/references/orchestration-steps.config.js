'use strict';

/**
 * Orchestration Steps Configuration
 *
 * This is the canonical source for the Maestro orchestration workflow.
 * Each section is either a 'phase' (with auto-numbered steps) or a 'block'
 * (freeform prose). Cross-references use {@step-id} tokens that the renderer
 * resolves to step numbers automatically.
 *
 * To add a step:   Insert an object in the steps array at the desired position.
 * To move a step:  Cut and paste the object to the new position.
 * To remove a step: Delete the object from the array.
 *
 * Numbering and cross-references update automatically on render.
 */

module.exports = [
  // ── STARTUP ─────────────────────────────────────────────────────────
  {
    type: 'phase',
    id: 'startup',
    label: 'STARTUP (Turn 1 \u2014 tool calls only, no text output)',
    steps: [
      {
        id: 'runtime-context',
        action:
          'If get_runtime_context appears in your available tools, call it. Carry the returned mappings (tool names, agent dispatch syntax, MCP prefix, paths) through the entire session. If unavailable, use the fallback mappings in the entry-point skill preamble.',
      },
      {
        id: 'resolve-settings',
        action: 'Call resolve_settings.',
      },
      {
        id: 'init-workspace',
        action: 'Call initialize_workspace with resolved state_dir.',
      },
      {
        id: 'check-session',
        action:
          'Call get_session_status \u2014 if active, present status and offer resume/archive.',
      },
      {
        id: 'assess-complexity',
        action: 'Call assess_task_complexity.',
      },
      {
        id: 'parse-disabled-agents',
        action:
          'Parse MAESTRO_DISABLED_AGENTS from resolved settings. Exclude listed agents from all planning.',
      },
      {
        id: 'startup-stop',
        action:
          'STOP. Turn 1 is ONLY steps {@resolve-settings}-{@parse-disabled-agents}. No text, no design questions, no file reads.',
      },
    ],
  },

  // ── CLASSIFICATION ──────────────────────────────────────────────────
  {
    type: 'phase',
    id: 'classification',
    label: 'CLASSIFICATION (Turn 2)',
    steps: [
      {
        id: 'load-architecture',
        action:
          'Load the architecture reference: ["architecture"]. Do NOT load templates yet \u2014 they are loaded at their consumption points (steps {@write-design-doc}, {@load-impl-planning}, {@load-session-mgmt}).',
      },
      {
        id: 'classify-task',
        action:
          'Classify task as simple/medium/complex. Present classification with rationale.',
      },
      {
        id: 'route-complexity',
        action:
          'Route: simple \u2192 Express (step {@express-verify}). Medium/complex \u2192 continue to step {@enter-plan-mode}.',
      },
    ],
  },

  // ── DESIGN (Phase 1) ───────────────────────────────────────────────
  {
    type: 'phase',
    id: 'design',
    label: 'DESIGN (Phase 1)',
    steps: [
      {
        id: 'enter-plan-mode',
        action:
          "Enter Plan Mode. If unavailable, follow the runtime preamble's Plan Mode fallback instructions.",
      },
      {
        id: 'load-design-dialogue',
        action:
          'Call `get_skill_content` with resources: ["design-dialogue"]. Follow the loaded protocol for:\n    - Design depth selector (first design question)\n    - Repository grounding (for existing codebases, skip for greenfield)\n    - One question at a time via user prompt\n    - Enrichment per chosen depth (Quick/Standard/Deep)',
        hardGate:
          'Technology Recommendation Gate: Before presenting technology options, re-read\nthe <user-request>. If the request implies static delivery (fan site, portfolio,\nlanding page, profile page) or specifies vanilla/static/no-frameworks, the\nrecommended option MUST be vanilla HTML/CSS/JS. Do NOT recommend frameworks\n(Next.js, React, Vue, Svelte, Astro) unless the request explicitly requires\nserver-side rendering, authentication, database queries, or real-time updates.',
        antiPattern:
          'WRONG: user requests "fan site" \u2192 options include React, Next.js, Astro\nCORRECT: user requests "fan site" \u2192 recommended option is vanilla HTML/CSS/JS',
      },
      {
        id: 'present-design-sections',
        action:
          "Present design sections one at a time, per the design-dialogue skill's convergence protocol.",
        hardGate:
          'Each section must be presented individually and approved via user prompt before\nproceeding to the next. Do NOT present the full design as a single block.\nQuick depth may combine sections. Standard/Deep MUST validate individually.',
      },
      {
        id: 'write-design-doc',
        action:
          'Call `get_skill_content` with resources: ["design-document"]. Write approved design document to <state_dir>/plans/ (or Plan Mode tmp path).',
      },
      {
        id: 'exit-plan-mode',
        action:
          'If Plan Mode is active, exit Plan Mode with the plan path. Copy approved document to <state_dir>/plans/.',
      },
    ],
  },

  // ── PLANNING (Phase 2) ─────────────────────────────────────────────
  {
    type: 'phase',
    id: 'planning',
    label: 'PLANNING (Phase 2)',
    steps: [
      {
        id: 'load-impl-planning',
        action:
          'Call `get_skill_content` with resources: ["implementation-planning", "implementation-plan"]. Follow the loaded skill protocol.',
      },
      {
        id: 'validate-plan',
        action: 'Call validate_plan with the generated plan and task_complexity.',
        hardGate:
          'You MUST call validate_plan BEFORE presenting the plan for approval. Do NOT\npresent the plan, write it to state_dir, or proceed to step {@present-plan} without first\ncalling validate_plan and resolving any error-severity violations.\nvalidate_plan enforces server-side: phase count limits, dependency cycles,\nunknown agents, file ownership conflicts, and agent-deliverable compatibility\n(read-only agents cannot be assigned to file-creating phases). If it returns\nviolations with severity "error", fix them in the plan and re-validate.',
      },
      {
        id: 'present-plan',
        action:
          'Present plan for user approval (Approve / Revise / Abort via user prompt).',
      },
      {
        id: 'write-impl-plan',
        action:
          'Write approved implementation plan to <state_dir>/plans/.',
      },
    ],
  },

  // ── EXECUTION SETUP (Phase 3 — pre-delegation) ─────────────────────
  {
    type: 'phase',
    id: 'execution-setup',
    label: 'EXECUTION SETUP (Phase 3 \u2014 pre-delegation)',
    steps: [
      {
        id: 'load-execution',
        action:
          'Call `get_skill_content` with resources: ["execution"]. Follow its Execution Mode Gate.',
        hardGate:
          'Present ONLY "Parallel" and "Sequential" as execution mode options.\nDo NOT present "Ask" as a user-facing choice \u2014 "ask" is a setting value\nthat means "prompt the user", not an execution mode the user selects.',
      },
      {
        id: 'load-session-mgmt',
        action:
          'Call `get_skill_content` with resources: ["session-management", "session-state"].',
      },
      {
        id: 'create-session',
        action:
          'Create session via create_session with resolved execution_mode. Do NOT create before mode is resolved.',
      },
      {
        id: 'load-delegation',
        action:
          'Call `get_skill_content` with resources: ["delegation", "validation", "agent-base-protocol", "filesystem-safety-protocol"].',
      },
    ],
  },

  // ── EXECUTION (Phase 3 — delegation loop) ──────────────────────────
  {
    type: 'phase',
    id: 'execution',
    label: 'EXECUTION (Phase 3 \u2014 delegation loop)',
    steps: [
      {
        id: 'delegate-agent',
        action:
          'For each phase (or parallel batch): call `get_agent` for the assigned agent, then delegate using the returned methodology and tool restrictions.',
        hardGate:
          "Dispatch by calling the agent's registered tool directly.\nDo NOT use the built-in generalist tool or invoke agents by bare name.\nEach Maestro agent carries specialized methodology, tool restrictions, temperature,\nand turn limits from its frontmatter that the generalist ignores.",
      },
      {
        id: 'parse-task-report',
        action:
          'After each agent returns, parse Task Report + Downstream Context from response.',
      },
      {
        id: 'transition-phase',
        action: 'Call transition_phase to persist results.',
        hardGate:
          'For parallel batches: call transition_phase INDIVIDUALLY for EVERY completed\nphase in the batch. The MCP tool writes files_created, files_modified,\nfiles_deleted, and downstream_context to the SPECIFIC phase identified by\ncompleted_phase_id. Extract each agent\'s Task Report separately and pass\nthat agent\'s files and context to the corresponding phase\'s call. Do NOT\nmerge all agents\' files into one call \u2014 the archive attributes files per\nphase, so empty payloads mean lost traceability.',
      },
      {
        id: 'repeat-execution',
        action:
          'Repeat steps {@delegate-agent}-{@transition-phase} until all phases complete.',
      },
    ],
  },

  // ── COMPLETION (Phase 4) ───────────────────────────────────────────
  {
    type: 'phase',
    id: 'completion',
    label: 'COMPLETION (Phase 4)',
    steps: [
      {
        id: 'load-code-review',
        action:
          'Call `get_skill_content` with resources: ["code-review"].',
      },
      {
        id: 'run-code-review',
        action:
          'If execution changed non-documentation files, delegate to the code reviewer agent. Block on Critical/Major findings.',
        hardGate:
          'If Critical/Major findings: re-delegate to the implementing agent to fix.\nThe orchestrator MUST NOT write code directly.',
      },
      {
        id: 'archive-session',
        action:
          'If MAESTRO_AUTO_ARCHIVE is true (or unset), call archive_session. If false, inform user session is complete but not archived.',
      },
      {
        id: 'present-summary',
        action:
          'Present final summary with files changed, phase outcomes, and next steps.',
      },
    ],
  },

  // ── RECOVERY ────────────────────────────────────────────────────────
  {
    type: 'block',
    id: 'recovery',
    label: 'RECOVERY (referenced from any step on user request)',
    content:
      'If the user says the flow moved too fast: return to the most recent unanswered approval gate.\nIf the user asks for implementation before approval: remind them Maestro requires approval first.\nIf the user asks to skip execution-mode: remind them parallel/sequential is required unless MAESTRO_EXECUTION_MODE pins it.\nIf an answer invalidates a prior choice: restate the updated assumption and re-run the relevant gate.\nIf delegation collapses to parent session without fallback approval: return to step {@load-execution} or re-scope the child-agent work packages.',
  },

  // ── EXPRESS WORKFLOW ────────────────────────────────────────────────
  {
    type: 'phase',
    id: 'express',
    label: 'EXPRESS WORKFLOW (simple tasks only \u2014 jumped to from step {@route-complexity})',
    preamble:
      'EXPRESS MODE GATE BYPASS: Express bypasses the execution-mode gate entirely. Express always dispatches sequentially. Do NOT prompt for parallel/sequential.\n\nEXPRESS MCP FALLBACK: If MCP state tools (create_session, transition_phase, archive_session) are unavailable, fall back to direct file writes on <state_dir>/state/active-session.md.',
    steps: [
      {
        id: 'express-verify',
        action:
          'Verify classification is simple. If task requires multiple phases or agents, override to medium \u2192 step {@enter-plan-mode}.',
        hardGate:
          'Express sessions MUST have exactly one implementation phase with exactly one agent.',
      },
      {
        id: 'express-questions',
        action: 'Ask 1-2 clarifying questions from Area 1 only.',
        hardGate:
          'Each question MUST use the user prompt tool (not plain text). Use the choose\nvariant with 2-4 options where possible. Do NOT ask questions as plain text\nin the model response \u2014 the user prompt tool is the only input mechanism.',
      },
      {
        id: 'express-brief',
        action:
          'Present structured Express brief as plain text, then ask for approval.',
        hardGate:
          'The brief MUST be plain text output in the model response.\nThe approval MUST be a SEPARATE user prompt tool call \u2014 not embedded in the\nbrief text. The prompt contains only: "Approve this Express brief to proceed?"\nThese are two distinct actions: first emit the brief as text, then call the\nuser prompt tool for approval. Do NOT combine them into one text block.',
      },
      {
        id: 'express-create-session',
        action:
          'On approval, create session with workflow_mode: "express", exactly 1 phase.\n    On rejection, revise. On second rejection, escalate to Standard \u2192 step {@enter-plan-mode}.',
      },
      {
        id: 'express-load-protocols',
        action:
          'Call `get_skill_content` with resources: ["agent-base-protocol", "filesystem-safety-protocol"] and prepend them to the delegation prompt.',
      },
      {
        id: 'express-delegate',
        action: 'Delegate to the assigned agent.',
        hardGate:
          'Same dispatch rule as step {@delegate-agent}: call agent by registered tool name, not generalist.',
      },
      {
        id: 'express-transition',
        action:
          "Parse Task Report from the agent's response. Call transition_phase to persist results.",
        hardGate:
          'You MUST call transition_phase after the implementing agent returns. Extract\nfiles_created, files_modified, files_deleted, and downstream_context from the\nTask Report and pass them to transition_phase. Without this call, the session\nstate has no record of what was delivered. Do NOT skip to code review or archive\nwithout calling transition_phase first.',
      },
      {
        id: 'express-code-review',
        action: 'Delegate to the code reviewer agent.',
        hardGate:
          'If Critical/Major findings: re-delegate to implementing agent (1 retry).\nOrchestrator MUST NOT write code directly. If retry fails, escalate to user.',
      },
      {
        id: 'express-archive',
        action: 'Call archive_session.',
      },
      {
        id: 'express-summary',
        action: 'Present summary.',
      },
    ],
  },

  // ── EXPRESS RESUME ──────────────────────────────────────────────────
  {
    type: 'block',
    id: 'express-resume',
    label: 'EXPRESS RESUME (when resuming an Express session from get_session_status)',
    content:
      'If phase is pending: re-generate and present brief (step {@express-brief}). On approval, proceed to delegation (step {@express-delegate}).\nIf phase is in_progress: re-delegate with same scope (step {@express-delegate}).\nIf phase is completed but session is in_progress: run code review (step {@express-code-review}), then archive (step {@express-archive}).',
  },
];
