STARTUP (Turn 1 — tool calls only, no text output)
 0. If get_runtime_context appears in your available tools, call it. Carry the returned mappings (tool names, agent dispatch syntax, MCP prefix, paths) through the entire session. If unavailable, use the fallback mappings in the entry-point skill preamble.
 1. Call resolve_settings.
 2. Call initialize_workspace with resolved state_dir.
 3. Local Settings Check:
    - Check for the existence of `.gemini/settings.json` in the current working directory.
    - If it's missing, use `ask_user` with `type: 'choice'` to prompt for operating mode:
      - **Quality**: Higher accuracy, higher cost
      - **Balanced**: Balanced performance and cost
      - **Economic**: Lowest cost, lower performance
      - **Skip**: Skip local model configuration (no settings.json will be created)
    - After selection:
      - If **Skip** was selected, do NOT call `setup_models`.
      - Otherwise, call the `setup_models` MCP tool with the `mode` parameter set to the selected mode to create the file with the appropriate agent overrides.
    - **Halt Execution**: Inform the user: "A restart of the Gemini client is necessary to activate the subagent model configuration. Restart the client and resume the session. I'll be waiting here."
    - **Wait for signal**: STOP here and wait for the user to restart and signal to continue. Do NOT proceed to Step 4 in this turn.
 4. Call get_session_status — if active, present status and offer resume/archive.
 5. Call assess_task_complexity.
 6. Parse MAESTRO_DISABLED_AGENTS from resolved settings. Exclude listed agents from all planning.
 7. STOP. Turn 1 is ONLY steps 1-6. No text, no design questions, no file reads.

CLASSIFICATION (Turn 2)
 8. Load the architecture reference: ["architecture"]. Do NOT load templates yet — they are loaded at their consumption points (steps 14, 16, 21).
 9. Classify task as simple/medium/complex. Present classification with rationale.
10. Route: simple → Express (step 32). Medium/complex → continue to step 11.

DESIGN (Phase 1)
11. Enter Plan Mode. If unavailable, follow the runtime preamble's Plan Mode fallback instructions.
12. Call `get_skill_content` with resources: ["design-dialogue"]. Follow the loaded protocol for:
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
13. Present design sections one at a time, per the design-dialogue skill's convergence protocol.
    <HARD-GATE>
    Each section must be presented individually and approved via user prompt before
    proceeding to the next. Do NOT present the full design as a single block.
    Quick depth may combine sections. Standard/Deep MUST validate individually.
    </HARD-GATE>
14. Call `get_skill_content` with resources: ["design-document"]. Write approved design document to <state_dir>/plans/ (or Plan Mode tmp path).
15. If Plan Mode is active, exit Plan Mode with the plan path. Copy approved document to <state_dir>/plans/.

PLANNING (Phase 2)
16. Call `get_skill_content` with resources: ["implementation-planning", "implementation-plan"]. Follow the loaded skill protocol.
17. Call validate_plan with the generated plan and task_complexity.
    <HARD-GATE>
    You MUST call validate_plan BEFORE presenting the plan for approval. Do NOT
    present the plan, write it to state_dir, or proceed to step 18 without first
    calling validate_plan and resolving any error-severity violations.
    validate_plan enforces server-side: phase count limits, dependency cycles,
    unknown agents, file ownership conflicts, and agent-deliverable compatibility
    (read-only agents cannot be assigned to file-creating phases). If it returns
    violations with severity "error", fix them in the plan and re-validate.
    </HARD-GATE>
18. Present plan for user approval (Approve / Revise / Abort via user prompt).
19. Write approved implementation plan to <state_dir>/plans/.

EXECUTION SETUP (Phase 3 — pre-delegation)
20. Call `get_skill_content` with resources: ["execution"]. Follow its Execution Mode Gate.
    <HARD-GATE>
    Present ONLY "Parallel" and "Sequential" as execution mode options.
    Do NOT present "Ask" as a user-facing choice — "ask" is a setting value
    that means "prompt the user", not an execution mode the user selects.
    </HARD-GATE>
21. Call `get_skill_content` with resources: ["session-management", "session-state"].
22. Create session via create_session with resolved execution_mode. Do NOT create before mode is resolved.
23. Call `get_skill_content` with resources: ["delegation", "validation", "agent-base-protocol", "filesystem-safety-protocol"].

EXECUTION (Phase 3 — delegation loop)
24. For each phase (or parallel batch): call `get_agent` for the assigned agent, then delegate using the returned methodology and tool restrictions.
    <HARD-GATE>
    Dispatch by calling the agent's registered tool directly.
    Do NOT use the built-in generalist tool or invoke agents by bare name.
    Each Maestro agent carries specialized methodology, tool restrictions, temperature,
    and turn limits from its frontmatter that the generalist ignores.
    </HARD-GATE>
25. After each agent returns, parse Task Report + Downstream Context from response.
26. Call transition_phase to persist results.
    <HARD-GATE>
    For parallel batches: call transition_phase INDIVIDUALLY for EVERY completed
    phase in the batch. The MCP tool writes files_created, files_modified,
    files_deleted, and downstream_context to the SPECIFIC phase identified by
    completed_phase_id. Extract each agent's Task Report separately and pass
    that agent's files and context to the corresponding phase's call. Do NOT
    merge all agents' files into one call — the archive attributes files per
    phase, so empty payloads mean lost traceability.
    </HARD-GATE>
27. Repeat steps 24-26 until all phases complete.

COMPLETION (Phase 4)
28. Call `get_skill_content` with resources: ["code-review"].
29. If execution changed non-documentation files, delegate to the code reviewer agent. Block on Critical/Major findings.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to the implementing agent to fix.
    The orchestrator MUST NOT write code directly.
    </HARD-GATE>
30. If MAESTRO_AUTO_ARCHIVE is true (or unset), call archive_session. If false, inform user session is complete but not archived.
31. Present final summary with files changed, phase outcomes, and next steps.

RECOVERY (referenced from any step on user request)
If the user says the flow moved too fast: return to the most recent unanswered approval gate.
If the user asks for implementation before approval: remind them Maestro requires approval first.
If the user asks to skip execution-mode: remind them parallel/sequential is required unless MAESTRO_EXECUTION_MODE pins it.
If an answer invalidates a prior choice: restate the updated assumption and re-run the relevant gate.
If delegation collapses to parent session without fallback approval: return to step 20 or re-scope the child-agent work packages.

EXPRESS WORKFLOW (simple tasks only — jumped to from step 10)

EXPRESS MODE GATE BYPASS: Express bypasses the execution-mode gate entirely. Express always dispatches sequentially. Do NOT prompt for parallel/sequential.

EXPRESS MCP FALLBACK: If MCP state tools (create_session, transition_phase, archive_session) are unavailable, fall back to direct file writes on <state_dir>/state/active-session.md.

32. Verify classification is simple. If task requires multiple phases or agents, override to medium → step 11.
    <HARD-GATE>
    Express sessions MUST have exactly one implementation phase with exactly one agent.
    </HARD-GATE>
33. Ask 1-2 clarifying questions from Area 1 only.
    <HARD-GATE>
    Each question MUST use the user prompt tool (not plain text). Use the choose
    variant with 2-4 options where possible. Do NOT ask questions as plain text
    in the model response — the user prompt tool is the only input mechanism.
    </HARD-GATE>
34. Present structured Express brief as plain text, then ask for approval.
    <HARD-GATE>
    The brief MUST be plain text output in the model response.
    The approval MUST be a SEPARATE user prompt tool call — not embedded in the
    brief text. The prompt contains only: "Approve this Express brief to proceed?"
    These are two distinct actions: first emit the brief as text, then call the
    user prompt tool for approval. Do NOT combine them into one text block.
    </HARD-GATE>
35. On approval, create session with workflow_mode: "express", exactly 1 phase.
    On rejection, revise. On second rejection, escalate to Standard → step 11.
36. Call `get_skill_content` with resources: ["agent-base-protocol", "filesystem-safety-protocol"] and prepend them to the delegation prompt.
37. Delegate to the assigned agent.
    <HARD-GATE>
    Same dispatch rule as step 24: call agent by registered tool name, not generalist.
    </HARD-GATE>
38. Parse Task Report from the agent's response. Call transition_phase to persist results.
    <HARD-GATE>
    You MUST call transition_phase after the implementing agent returns. Extract
    files_created, files_modified, files_deleted, and downstream_context from the
    Task Report and pass them to transition_phase. Without this call, the session
    state has no record of what was delivered. Do NOT skip to code review or archive
    without calling transition_phase first.
    </HARD-GATE>
39. Delegate to the code reviewer agent.
    <HARD-GATE>
    If Critical/Major findings: re-delegate to implementing agent (1 retry).
    Orchestrator MUST NOT write code directly. If retry fails, escalate to user.
    </HARD-GATE>
40. Call archive_session.
41. Present summary.

EXPRESS RESUME (when resuming an Express session from get_session_status)
If phase is pending: re-generate and present brief (step 34). On approval, proceed to delegation (step 37).
If phase is in_progress: re-delegate with same scope (step 37).
If phase is completed but session is in_progress: run code review (step 39), then archive (step 40).
