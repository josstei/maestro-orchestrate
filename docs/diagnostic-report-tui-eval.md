# Maestro TUI Orchestration Diagnostic Assessment & Performance Report

## Document Metadata

- **Evaluated Repository**: `josstei/maestro-orchestrate`
- **Evaluated Branch**: `refactor/codebase_normalization_reduction`
- **Evaluated Commit SHA**: `d67aab4e7eb272b32db9be64cfdc466663dc0280` (Baseline Commit)
- **Report Generation Date**: 2026-08-06 (Baseline) / Updated for Audit Correction
- **Evidence Bundle Location**: `docs/evidence/tui-eval/` (Provisional / Pending Phase 4 Execution)
- **Report Status**: `provisional / audit-corrected`
- **Evidence Notice**: All runtime observations lacking committed machine evidence are classified as `unverified`. Static code properties are classified as `code-grounded`.

---

## Executive Summary

An end-to-end orchestration test was executed in an interactive `tmux`-managed `agy` TUI session (`maestro_tui_eval` `[unverified]`) running `Gemini 3.6 Flash (High)` `[unverified]`. The task requested the creation of a static landing page for **"Nova Analytics"** inside `./test-site/`.

While the requested static deliverables (`test-site/index.html` reported at 13.5 KB `[unverified]` and `test-site/styles.css` reported at 13.3 KB `[unverified]`) were materialized, session state was updated (`active-session.md`), and the session was archived (`2026-08-06-nova-analytics-landing-page.md` `[unverified]`), the run was **protocol-noncompliant**. The assigned implementation agent (`coder`) failed or degraded during dispatch, and the parent orchestrator performed direct file writes to complete the deliverables. Furthermore, mandatory code review was neither executed nor recorded prior to session archival.

### Orchestration Result Matrix

| Dimension | Classification | Detail & Evidence Status |
| --- | --- | --- |
| **Requested Artifacts Created** | `reported successful; unverified` | Deliverables materialized in `./test-site/`; content unverified against schema/styles. |
| **Session State Lifecycle** | `reported successful; unverified` | `create_session`, `transition_phase`, `archive_session` executed without throwing errors. |
| **Assigned Implementation Agent Execution** | `failed or degraded` | `Agent(coder)` dispatch failed to produce code directly within the subagent context. |
| **Parent Fallback Implementation** | `protocol violation` | Direct file creation by parent orchestrator violates Maestro delegation rules. |
| **Mandatory Code Review** | `not evidenced` | `record_code_review` was not invoked; review gate was not enforced before archive. |
| **Overall Orchestration Outcome** | **`artifact-successful but protocol-noncompliant`** | Deliverables produced via forbidden parent write; orchestration integrity compromised. |

---

## 1. Run Timeline & Performance Breakdown

| Stage | Duration | Status | Key Actions & MCP Calls |
| --- | --- | --- | --- |
| **0. Workspace Init** | 2.1s `[unverified]` | Success | `initialize_workspace`, `resolve_settings` |
| **1. Complexity Analysis** | 2.3s `[unverified]` | Success | `assess_task_complexity` $\rightarrow$ Simple (Express Flow) |
| **2. Design Dialogue** | 4.2s `[unverified]` | Success | Interactive questions for aesthetic & feature selection |
| **3. Express Brief Approval**| 2.8s `[unverified]` | Success | User approval prompt via `tmux` keyboard selection |
| **4. Session Creation** | 1.8s `[unverified]` | Success | `create_session` $\rightarrow$ `active-session.md` materialized |
| **5. Implementation Phase** | 16.4s `[unverified]` | **Protocol Violation (Degraded)** | `Agent(coder)` dispatch failed/degraded $\rightarrow$ parent fallback direct file creation (`index.html`, `styles.css`) |
| **6. Phase Transition** | 2.1s `[unverified]` | Success | `transition_phase` $\rightarrow$ state checkpoint saved |
| **7. Archival & Complete** | 1.9s `[unverified]` | **Non-Compliant Archival** | `archive_session` executed without required code review |
| **Total Run Duration** | **33.6s [unverified]** | **ARTIFACT-SUCCESSFUL / PROTOCOL-NONCOMPLIANT** | Full lifecycle finished via non-compliant fallback and skipped review gate |

---

## 2. Detailed Diagnostic Findings: `create_session` & `get_agent`

### A. `create_session` Tool Call Analysis

#### 1. Payload & Schema Inspection
In `src/mcp/tool-packs/session/zod-schemas.ts` and `src/mcp/contracts/plan-schema.ts` `[code-grounded]`:
- `create_session` requires `session_id`, `task`, and a `phases` array.
- Each item in the `phases` wire array requires `{ id, name, agent, parallel, blocked_by }` where `agent` is a singular string.

#### 2. Root Cause Analysis & Validation Layer Distinction
Codebase analysis reveals two distinct validation layers and failure triggers:

1. **Failure-Layer Distinction (SDK/Zod Boundary vs Service Validation)** `[code-grounded]`:
   - **External MCP Boundary**: `create_session` receives arguments validated by `WirePlanPhaseSchema`. If an LLM passes `agents: ["coder"]` (plural array) instead of `agent: "coder"` (singular string), Zod rejects the request at the MCP SDK boundary with a parse error (`missing_required_field: agent`).
   - **Service-Level Validation**: If raw object payloads bypass Zod (e.g. internal service calls), `validatePhases` inside `PlanValidator` acts as defense-in-depth, checking canonical properties.
   - **Correction**: Malformed MCP tool calls fail at the external SDK/Zod boundary before reaching `validatePhases`.

2. **Design Gate Session ID Mismatch (`DESIGN_GATE_SESSION_MISMATCH`)** `[code-grounded]`:
   - **Exact Condition**: `DESIGN_GATE_SESSION_MISMATCH` is thrown by `create_session` when an **approved** design gate file (`<session_id>.design-gate.json`) exists in `docs/maestro/state/` that belongs to a **different** `session_id`, while the current session lacks its own approved gate.
   - **Clarification**: Stale *unapproved* gate files do not trigger `DESIGN_GATE_SESSION_MISMATCH`. An unapproved gate for the *current* session triggers `DESIGN_GATE_UNAPPROVED`.
   - **Verification Note**: Pre-execution cleanup of gate files avoided the condition during testing, but cleanup alone does not prove causality without captured execution traces.

3. **Implementation Plan Path Resolution Semantics** `[code-grounded]`:
   - Path resolution in `resolveImplementationPlan` exhibits four distinct behaviors:
     1. **Workspace-relative existing path**: Resolved relative to workspace root and supported.
     2. **Absolute existing path**: Supported when within the accessible server filesystem namespace.
     3. **Literal tilde path (`~/.gemini/...`)**: Node `fs` path resolution does not perform shell tilde expansion; treated as a literal relative path and fails with `NOT_FOUND` unless such a literal path exists on disk.
     4. **Missing or restricted path**: Fails with `NOT_FOUND` or permission errors.
   - **Content Variant**: `implementation_plan_content` plus `implementation_plan_filename` provides source-path-independent plan materialization, but still performs filename, content, and filesystem validation.

---

### B. `get_agent` (and `getAgent`) Tool Call Analysis

#### 1. Payload & Schema Inspection
In `src/mcp/handlers/get-agent.ts` and `src/mcp/tool-packs/content/index.ts` `[code-grounded]`:
```typescript
// Canonical schema in src/mcp/tool-packs/content/index.ts
get_agent: {
  agents: z.array(z.string()).min(1)
}
```

#### 2. Root Cause Analysis
1. **Parameter Shape Rigidity (`agents` array vs `agent` string)** `[code-grounded]`:
   - **Issue**: Invoking `get_agent` with `{ agent: "coder" }` (singular alias) or `{ agents: "coder" }` (string instead of array) causes Zod parse validation failure at the MCP boundary.
   - **Handler Behavior**: `handleGetAgent` expects `params.agents` to be an array. If Zod validation were bypassed, `params.agents` being `undefined` leads to a `TypeError: requestedAgents is not iterable`.
   - **Occurrence Frequency**: Described as *observed in the evaluated run* `[unverified]` or *a plausible model-generated error shape* `[code-grounded]`; categorical frequency claims ("routinely", "consistently") are unverified pending machine evidence.
2. **CamelCase Tool Lookup (`getAgent`)** `[code-grounded]`:
   - `getAgent` is not a registered tool alias in the MCP server. Invoking `getAgent` fails at the tool-discovery layer with `Tool not found`.

---

## 3. Mandatory Remediation Specifications

To eliminate parameter rigidity and enforce orchestration integrity across all LLM runtime callers, the following architectural fixes are specified for implementation:

### 1. Bounded Input Normalization (Phase 2)
- **`get_agent`**: External MCP schema accepts compatibility aliases (`agent: string`, `agents: string`). A shared normalizer maps valid inputs to canonical `{ agents: string[] }`. Reject empty strings, empty arrays, non-string items, missing fields, and payloads containing both `agent` and `agents`.
- **Plan Phase `create_session`**: External MCP schema accepts single-entry `agents: ["coder"]` compatibility alias. Normalize to canonical `agent: "coder"`. Reject multiple agents, empty arrays, non-string items, missing fields, and payloads containing both `agent` and `agents`.

### 2. Orchestration Integrity & Mandatory Review Gates (Phase 3)
- **No Parent Direct-Write Fallback**: Subagent delegation failures must be recorded as phase failures. The parent orchestrator is strictly prohibited from writing code directly to recover.
- **Mandatory Code Review Gate**: Non-documentation changes require an explicit, passing code review (`record_code_review`) before `archive_session` can succeed. Failed or unreviewed sessions are blocked from archiving.

---

## 4. Evaluated Deliverables & Production-Readiness Assessment

### A. Reported Deliverables `[unverified]`
1. `test-site/index.html` (13,581 bytes reported `[unverified]`)
2. `test-site/styles.css` (13,345 bytes reported `[unverified]`)
3. Archived state: `docs/maestro/state/archive/2026-08-06-nova-analytics-landing-page.md` `[unverified]`

### B. Production-Readiness Criteria (Unverified)
The deliverables **cannot** be classified as "production-ready" without objective machine evidence. To achieve a "production-ready" classification, all of the following criteria must pass:

- [ ] **HTML5 Standards Validation**: Clean pass on W3C markup validation without structural errors.
- [ ] **Accessibility Audit (WCAG 2.1 AA)**: Zero ARIA, color contrast, or keyboard navigation violations.
- [ ] **Responsive Viewport Verification**: Verified layout integrity across mobile (375px), tablet (768px), and desktop (1440px).
- [ ] **Browser Console Audit**: Zero JavaScript errors or missing asset exceptions.
- [ ] **Asset & Link Verification**: All stylesheet, font, and image resource links resolve cleanly.
- [ ] **Mandatory Code Review**: Explicitly recorded `record_code_review` with zero blocking findings.

*Current Status*: Complete static landing-page implementation was reported as generated `[unverified]`, but production readiness remains **unverified**.

---

## Appendix: Audit Finding Remediation Status

| ID | Finding Description | Baseline Classification | Target Phase | Remediation Status |
| --- | --- | --- | --- | --- |
| **F-01** | Incorrect overall success classification despite degraded delegation | Protocol Non-Compliant | 1, 3, 6 | `document-corrected` |
| **F-02** | Direct parent write characterized as valid recovery | Protocol Violation | 1, 3 | `document-corrected` |
| **F-03** | Mandatory code review not demonstrated before archive | Missing Evidence | 1, 3, 5, 6 | `document-corrected` |
| **F-04** | Ambiguity between SDK boundary rejection and `validatePhases` | Code-Grounded Correction | 1, 2, 5 | `document-corrected` |
| **F-05** | Overly broad design-gate mismatch description | Code-Grounded Correction | 1, 5 | `document-corrected` |
| **F-06** | Incorrect relative-path failure statement | Code-Grounded Correction | 1, 4, 5 | `document-corrected` |
| **F-07** | Unsupported occurrence-frequency language for `get_agent` | Unverified Claims | 1, 2, 4 | `document-corrected` |
| **F-08** | Proposed `get_agent` fix allowed empty/conflicting inputs | Design Revision | 2, 5 | `document-corrected` |
| **F-09** | Proposed `create_session` fix lacked single-agent cardinality rules | Design Revision | 2, 5 | `document-corrected` |
| **F-10** | Unverified timings, file sizes, test totals presented as facts | Unverified Claims | 1, 4, 5, 6 | `document-corrected` |
| **F-11** | Unsupported "production-ready" and quality language | Unverified Claims | 1, 4, 6 | `document-corrected` |

---
