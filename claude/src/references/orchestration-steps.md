STARTUP (Turn 1 — tool calls only, no text output)
 0. If get_runtime_context appears in your available tools, call it. Carry the returned mappings (tool names, agent dispatch syntax, MCP prefix, paths) through the entire session. If unavailable, use the fallback mappings in the entry-point skill preamble.
 1. Call resolve_settings.
 2. Read `workspace_suggestion` from the `get_runtime_context` response (populated from MCP roots and/or runtime env var). Call `initialize_workspace(workspace_path=<workspace_suggestion or explicit user workspace>, state_dir=<resolved>)`. If no suggestion is available, ask the user via the runtime's user-prompt tool. `initialize_workspace` rejects paths inside extension caches.
 3. Call get_session_status — if active, present status and offer resume/archive.
 4. Call assess_task_complexity.
 5. Parse MAESTRO_DISABLED_AGENTS from resolved settings. Exclude listed agents from all planning.
 6. STOP. Turn 1 is ONLY steps 1-5. No text, no design questions, no file reads.

CLASSIFICATION (Turn 2)
 7. Pre-load architecture plus every skill used before Phase 3 in a single batch:
    `get_skill_content(["architecture", "design-dialogue", "design-document", "implementation-planning", "implementation-plan"])`.
    <HARD-GATE>
    This batch MUST complete before any `enter_plan_mode` call. Some runtimes
    (notably Gemini CLI) deregister MCP tools once Plan Mode is active —
    attempting to fetch these skills from inside Plan Mode will fail with
    "tool not found" and strand the orchestrator. Execution-phase templates
    (session-management, session-state, execution, delegation, validation,
    agent-base-protocol, filesystem-safety-protocol, code-review) still load
    lazily at their consumption points because Phase 3 never enters Plan Mode.
    </HARD-GATE>
 8. Classify task as simple/medium/complex. Present classification with rationale.
 9. Route: simple → Express (step 31). Medium/complex → continue to step 10.

DESIGN GATE (Phase 1 pre-entry)
 9a. Finalize the session_id now and use it verbatim for every subsequent MCP call. Format: `YYYY-MM-DD-<kebab-task-slug>`. Then call `enter_design_gate(session_id)`. This blocks `create_session` until `record_design_approval` is called. Idempotent; safe to call on resume.
    <HARD-GATE>
    Session ID Invariance — the session_id chosen here MUST be passed unchanged
    to every MCP call that accepts a session_id parameter for the remainder of
    this workflow: `record_design_approval`, `get_design_gate_status`,
    `create_session`, `update_session`, `get_session_status`, `transition_phase`,
    `scan_phase_changes`, `reconcile_phase`, and `archive_session`. Do NOT
    substitute a placeholder id for initial calls and a final id later — the
    design gate is keyed by session_id, so a drift orphans the approved gate
    and strands the design document. `create_session` rejects with
    `DESIGN_GATE_SESSION_MISMATCH` when it detects an approved gate for a
    different session_id than the one passed in.
    </HARD-GATE>

DESIGN (Phase 1)
10. Enter Plan Mode. If `plan_mode_native` from `get_runtime_context` is false (Codex), the server-side Design Gate (9a + step 13) is the authoritative contract; runtime-native plan mode is a UI affordance only.
11. Using the `design-dialogue` protocol already loaded in step 7, run the design conversation:
    - Design depth selector (first design question)
    - Repository grounding (for existing codebases, skip for greenfield)
    - One question at a time via user prompt
    - Enrichment per chosen depth (Quick/Standard/Deep)
    <HARD-GATE>
    Technology Recommendation Gate: Before presenting technology options, re-read
    the <user-request>. If the request implies static delivery (fan site, portfolio,
    landing page, profile page) or specifies vanilla/static/no-frameworks, the
    recommended option MUST be vanilla HTML/CSS/JS. Do NOT recommend frameworks
    (Next.js, React, Vue, Svelte, Astro) unless the request explicitly requires
    server-side rendering, authentication, database queries, or real-time updates.
    </HARD-GATE>
    <ANTI-PATTERN>
    WRONG: user requests "fan site" → options include React, Next.js, Astro
    CORRECT: user requests "fan site" → recommended option is vanilla HTML/CSS/JS
    </ANTI-PATTERN>
12. Present design sections one at a time, per the design-dialogue skill's convergence protocol.
    <HARD-GATE>
    Each section must be presented individually and approved via user prompt before
    proceeding to the next. Do NOT present the full design as a single block.
    Quick depth may combine sections. Standard/Deep MUST validate individually.
    </HARD-GATE>
13. Using the `design-document` template already loaded in step 7, write the approved design document to the runtime's write surface (Plan Mode tmp for Gemini, `<state_dir>/plans/` when Plan Mode is unavailable). Do NOT call `record_design_approval` while still inside Plan Mode — Gemini deregisters MCP tools during Plan Mode and the call will fail.
14. If Plan Mode is active, exit Plan Mode with the plan path. MCP tools become available again at this point.
14a. Call `record_design_approval` to clear the design gate. Choose the variant by runtime:
     - **Content variant (required for Gemini)**: pass `design_document_content` + `design_document_filename`. The MCP server materializes the canonical copy inside `<state_dir>/plans/` atomically. Required whenever the runtime's write surface resolves relative paths against a root the MCP server cannot reach — Gemini Plan Mode writes to `~/.gemini/tmp/<uuid>/...`, so a path handed back to the server never resolves to the same file.
     - **Path variant (Codex, Claude direct writes)**: pass `design_document_path` (absolute or workspace-relative). The approval handler records the path without requiring the file to already be on disk; `create_session` in step 21 materializes the file into `<state_dir>/plans/` and will reject if the file is still missing at that point.
     <HARD-GATE>
     The two variants are mutually exclusive. Supplying both, or neither, fails with VALIDATION_ERROR.
     </HARD-GATE>

PLANNING (Phase 2)
15. Using the `implementation-planning` and `implementation-plan` resources already loaded in step 7, follow the planning protocol to draft the implementation plan. If the planning skill instructs you to re-enter Plan Mode for the plan-approval UI, write the plan document first; all subsequent MCP calls (including `validate_plan`) must happen after the next `exit_plan_mode`, not inside Plan Mode.
16. Call validate_plan with the generated plan and task_complexity.
    <HARD-GATE>
    You MUST call validate_plan BEFORE presenting the plan for approval. Do NOT
    present the plan, write it to state_dir, or proceed to step 17 without first
    calling validate_plan and resolving any error-severity violations.
    validate_plan enforces server-side: phase count limits, dependency cycles,
    unknown agents, file ownership conflicts, and agent-deliverable compatibility
    (read-only agents cannot be assigned to file-creating phases). If it returns
    violations with severity "error", fix them in the plan and re-validate.
    </HARD-GATE>
17. Present plan for user approval (Approve / Revise / Abort via user prompt).
18. Write approved implementation plan to <state_dir>/plans/.

EXECUTION SETUP (Phase 3 — pre-delegation)
19. Call `get_skill_content` with resources: ["execution"]. Follow its Execution Mode Gate.
    <HARD-GATE>
    Present ONLY "Parallel" and "Sequential" as execution mode options.
    Do NOT present "Ask" as a user-facing choice — "ask" is a setting value
    that means "prompt the user", not an execution mode the user selects.
    </HARD-GATE>
20. Call `get_skill_content` with resources: ["session-management", "session-state"].
21. Pass the exact plan object returned by `validate_plan` to `create_session`. Do not reshape phases — `create_session` rejects plans whose phases are missing required fields ({id, name, agent, parallel, blocked_by}). Set `execution_mode` to the value resolved in step 19. Attach the implementation plan document by runtime:
    - **Content variant (required for Gemini)**: pass `implementation_plan_content` + `implementation_plan_filename`. Mirrors the design-document content path in step 14a and closes the same runtime-tmp resolution gap when Plan Mode is used for plan approval.
    - **Path variant (Codex, Claude direct writes)**: pass `implementation_plan` as an absolute or workspace-relative path. Requires the file to exist on disk at the workspace-resolved path when `create_session` runs.
    <HARD-GATE>
    The two variants are mutually exclusive. Supplying both fails with VALIDATION_ERROR. Supplying neither is valid — the session records no implementation plan.
    </HARD-GATE>
22. Call `get_skill_content` with resources: ["delegation", "validation", "agent-base-protocol", "filesystem-safety-protocol"].

EXECUTION (Phase 3 — delegation loop)
23. For each phase (or parallel batch): call `get_agent` for the assigned agent, then delegate using the returned methodology and tool restrictions. Before constructing the dispatch, read `delegation.constraints` from the cached `get_runtime_context` and shape the call accordingly — omit `agent_type`/`model`/`reasoning_effort` when `fork_full_context_incompatible_with` includes them and you are spawning with full-history fork.
    <HARD-GATE>
    Dispatch by calling the agent's registered tool directly.
    Do NOT use the built-in generalist tool or invoke agents by bare name.
    Each Maestro agent carries specialized methodology, tool restrictions, temperature,
    and turn limits from its frontmatter that the generalist ignores.
    </HARD-GATE>
24. After each agent returns, parse the response. If a `## Blockers` section is present and non-empty, do NOT call `transition_phase`: aggregate blockers across the batch, ask the user via the user-prompt tool, and re-delegate the phase with the answer in the context block. Only when blockers are empty, parse Task Report + Downstream Context.
25. Call transition_phase to persist results. `transition_phase` rejects with `HANDOFF_INCOMPLETE` if the phase produced files but downstream_context is empty — re-request the handoff. It sets `requires_reconciliation: true` when all manifests AND downstream_context are empty — in that case, invoke the Recovery Protocol in the execution skill (`scan_phase_changes` → user confirmation → `reconcile_phase`).
    <HARD-GATE>
    For parallel batches: call transition_phase INDIVIDUALLY for EVERY completed
    phase in the batch. The MCP tool writes files_created, files_modified,
    files_deleted, and downstream_context to the SPECIFIC phase identified by
    completed_phase_id. Extract each agent's Task Report separately and pass
    that agent's files and context to the corresponding phase's call. Do NOT
    merge all agents' files into one call — the archive attributes files per
    phase, so empty payloads mean lost traceability.
    </HARD-GATE>
26. Repeat steps 23-25 until all phases complete.

COMPLETION (Phase 4)
27. Call `get_skill_content` with resources: ["code-review"].
28. If execution changed non-documentation files, delegate to the code reviewer agent. Block on Critical/Major findings.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to the implementing agent to fix.
    The orchestrator MUST NOT write code directly.
    </HARD-GATE>
29. If MAESTRO_AUTO_ARCHIVE is true (or unset), call archive_session. If false, inform user session is complete but not archived.
30. Present final summary with files changed, phase outcomes, and next steps.

RECOVERY (referenced from any step on user request)
If the user says the flow moved too fast: return to the most recent unanswered approval gate.
If the user asks for implementation before approval: remind them Maestro requires approval first.
If the user asks to skip execution-mode: remind them parallel/sequential is required unless MAESTRO_EXECUTION_MODE pins it.
If an answer invalidates a prior choice: restate the updated assumption and re-run the relevant gate.
If delegation collapses to parent session without fallback approval: return to step 19 or re-scope the child-agent work packages.

EXPRESS WORKFLOW (simple tasks only — jumped to from step 9)

EXPRESS MODE GATE BYPASS: Express bypasses the execution-mode gate entirely. Express always dispatches sequentially. Do NOT prompt for parallel/sequential.

EXPRESS MCP FALLBACK: If MCP state tools (create_session, transition_phase, archive_session) are unavailable, fall back to direct file writes on <state_dir>/state/active-session.md.

31. Verify classification is simple. If task requires multiple phases or agents, override to medium → step 10.
    <HARD-GATE>
    Express sessions MUST have exactly one implementation phase with exactly one agent.
    </HARD-GATE>
32. Ask 1-2 clarifying questions from Area 1 only.
    <HARD-GATE>
    Each question MUST use the user prompt tool (not plain text). Use the choose
    variant with 2-4 options where possible. Do NOT ask questions as plain text
    in the model response — the user prompt tool is the only input mechanism.
    </HARD-GATE>
33. Present structured Express brief as plain text, then ask for approval.
    <HARD-GATE>
    The brief MUST be plain text output in the model response.
    The approval MUST be a SEPARATE user prompt tool call — not embedded in the
    brief text. The prompt contains only: "Approve this Express brief to proceed?"
    These are two distinct actions: first emit the brief as text, then call the
    user prompt tool for approval. Do NOT combine them into one text block.
    </HARD-GATE>
34. On approval, create session with workflow_mode: "express", exactly 1 phase.
    On rejection, revise. On second rejection, escalate to Standard → step 10.
35. Call `get_skill_content` with resources: ["agent-base-protocol", "filesystem-safety-protocol"] and prepend them to the delegation prompt.
36. Delegate to the assigned agent.
    <HARD-GATE>
    Same dispatch rule as step 23: call agent by registered tool name, not generalist.
    </HARD-GATE>
37. Parse Task Report from the agent's response. Call transition_phase to persist results.
    <HARD-GATE>
    You MUST call transition_phase after the implementing agent returns. Extract
    files_created, files_modified, files_deleted, and downstream_context from the
    Task Report and pass them to transition_phase. Without this call, the session
    state has no record of what was delivered. Do NOT skip to code review or archive
    without calling transition_phase first.
    </HARD-GATE>
38. Delegate to the code reviewer agent.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to implementing agent (1 retry).
    Orchestrator MUST NOT write code directly. If retry fails, escalate to user.
    </HARD-GATE>
39. Call archive_session.
40. Present summary.

EXPRESS RESUME (when resuming an Express session from get_session_status)
If phase is pending: re-generate and present brief (step 33). On approval, proceed to delegation (step 36).
If phase is in_progress: re-delegate with same scope (step 36).
If phase is completed but session is in_progress: run code review (step 38), then archive (step 39).
