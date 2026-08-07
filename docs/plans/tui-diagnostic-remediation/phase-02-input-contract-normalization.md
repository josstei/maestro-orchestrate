# Phase 2 — MCP Input Contract Normalization

## Objective

Resolve the `agent`/`agents` ambiguity without weakening validation or introducing implicit multi-agent phase semantics. Compatibility input is normalized at the external boundary; all internal code continues to consume canonical representations.

## Architectural Decision

### Canonical Forms

- `get_agent`: `{ agents: string[] }`
- plan phase: `{ id, name, agent: string, parallel, blocked_by, files? }`
- persisted phase state: `agents: string[]`

The persisted `agents` field does not change the plan-phase domain model. A plan phase still owns exactly one assigned agent.

### Accepted Compatibility Forms

For `get_agent`:

- `{ agents: ["coder"] }`
- `{ agents: "coder" }`
- `{ agent: "coder" }`, retained only as an explicit compatibility alias

For a `create_session` phase:

- `{ agent: "coder" }`
- `{ agents: ["coder"] }`, retained only as a single-entry compatibility alias

### Rejected Forms

- neither canonical nor alias field;
- both canonical and alias fields;
- empty strings;
- empty arrays;
- arrays with non-string entries;
- more than one `agents` entry on a plan phase;
- `agent` arrays;
- conflicting values;
- whitespace-only identifiers.

Both fields are rejected even when they contain equivalent values. This avoids precedence rules and makes malformed generation visible.

## Implementation Tasks

### 1. Introduce a Shared Compatibility Normalizer

Add a focused source module, recommended path:

- `src/mcp/contracts/input-compatibility.ts`

Expose narrowly typed functions rather than allowing handlers to repeat ad hoc nullish-coalescing logic:

```typescript
normalizeGetAgentInput(params): { agents: string[] }
normalizePlanPhaseAgentInput(value): canonical phase object
```

A small private one-or-many helper may be shared internally, but the exported API should be domain-named. Each function must:

- trim identifiers;
- reject empty values;
- enforce field exclusivity;
- enforce minimum and maximum cardinality;
- preserve caller order;
- return new objects/arrays without mutating arguments;
- throw `ValidationError` with a stable code and structured details.

Recommended error codes:

- `MISSING_AGENT_INPUT`
- `AMBIGUOUS_AGENT_INPUT`
- `INVALID_AGENT_INPUT`
- `INVALID_AGENT_CARDINALITY`

Use the repository error primitives rather than plain `TypeError` for user payload errors.

### 2. Normalize `get_agent` at the Tool Boundary

Modify:

- `src/mcp/tool-packs/content/index.ts`
- `src/mcp/handlers/get-agent.ts`

Schema behavior:

- expose both `agents` and compatibility `agent` properties;
- allow `agents` to be a string or nonempty string array;
- allow `agent` to be a nonempty string only;
- keep both optional at the raw-shape level because XOR cannot be represented by independent raw-shape properties;
- enforce presence and exclusivity in `normalizeGetAgentInput` immediately on handler entry.

After normalization, `handleGetAgent` must operate only on `normalized.agents`. It must never branch on alias fields.

Update the tool description to show the canonical payload first and label scalar/alias forms as compatibility behavior. Do not advertise camel-case `getAgent` as a tool alias.

### 3. Normalize Plan Phase Input Before Canonical Validation

Modify:

- `src/mcp/contracts/plan-schema.ts`
- `src/mcp/tool-packs/zod-fragments.ts`, only if export typing requires it
- `src/mcp/session/session-lifecycle-service.ts`, only for direct/internal defense

Implementation direction:

1. Keep `PlanPhaseSchema` canonical and singular.
2. Wrap the wire phase schema in a preprocessing step that maps a valid single-entry `agents` alias to `agent`.
3. Reject both fields, zero/multiple entries, invalid strings, and arrays assigned to singular `agent`.
4. Ensure the parsed result type remains the canonical `WirePlanPhase`/`PlanPhase` shape.
5. Ensure `validatePhases` validates canonical values and does not silently accept unnormalized aliases.
6. If internal code calls `createSession` without passing through MCP schema parsing, normalize its phase array with the same shared function before `validatePhases`, or explicitly enforce that all internal callers pass parsed canonical values and add a test proving the invariant. Prefer defense-in-depth normalization in `createSession` so direct test/service calls behave consistently.

Do not convert a multi-entry alias to the first agent. Do not create multiple phases implicitly.

### 4. Preserve Persisted State Semantics

No persisted schema migration is required for the `agents` array itself. Verify:

- `initialPhaseState` receives canonical `phase.agent`;
- persisted state remains `agents: [phase.agent]`;
- `get_session_status` may continue returning the first assigned agent as singular `agent` where its public response contract already does so;
- archive, resume, cost, and performance code continue reading persisted arrays.

### 5. Improve Error Observability

Ensure normalized input failures preserve:

- tool name;
- canonical field name;
- alias field name when supplied;
- received value kind;
- expected cardinality;
- stable error code.

Do not include full arbitrary payloads in errors because identifiers may be user-controlled. Include only sanitized field-level details.

### 6. Update Contract Documentation

Update relevant canonical source documentation:

- `src/references/orchestration-steps.md`
- `src/skills/shared/session-management/SKILL.md`
- `docs/runtime-payload-contract.md`
- tool descriptions in the content/session packs

Clarify:

- planner output always uses singular `agent`;
- persisted session state uses plural `agents`;
- `get_agent` canonical input uses plural `agents`;
- compatibility aliases are accepted for resilience but should not be emitted by Maestro prompts or examples.

Run generation so downstream runtime copies receive the source documentation changes.

## Focused Test Plan

### Unit Tests

Add `tests/unit/input-compatibility.test.js` covering the complete matrix:

| Payload | Expected |
| --- | --- |
| `agents: ["coder"]` | canonical `['coder']` |
| `agents: "coder"` | canonical `['coder']` |
| `agent: "coder"` | canonical `['coder']` |
| no fields | structured missing error |
| both fields | structured ambiguous error |
| empty array | invalid input |
| empty/whitespace string | invalid input |
| plan phase `agents: ["coder"]` | canonical `agent: 'coder'` |
| plan phase `agents: []` | cardinality error |
| plan phase two agents | cardinality error |
| plan phase both fields | ambiguous error |
| input object after call | unchanged |

### Integration Tests

Extend:

- `tests/integration/plan-contract.test.js`
- `tests/integration/mcp-server-bundle-behavior.test.js`

Verify:

- `validate_plan` canonical output still round-trips verbatim to `create_session`;
- compatibility phase aliases parse to canonical state;
- scalar `agents` and singular `agent` compatibility work in every static runtime bundle;
- empty and ambiguous payloads fail in every runtime bundle;
- exact camel-case tool name remains absent unless a separate explicit alias decision is made.

### Type Tests

Add or extend type tests proving handlers receive canonical normalized values after the normalization call and persisted phase creation still requires a single canonical agent.

## Validation Commands

```bash
npm run build
node --test tests/unit/input-compatibility.test.js
node --test tests/integration/plan-contract.test.js
node --test tests/integration/mcp-server-bundle-behavior.test.js
npm run typecheck
npm run typecheck:type-tests
npm run generate
npm run check:source
```

## Deliverables

- Shared compatibility-normalization module.
- Safe `get_agent` compatibility handling.
- Safe plan-phase compatibility handling with exact-one cardinality.
- Stable structured errors.
- Canonical/compatibility documentation.
- Complete unit, integration, bundle, and type coverage.

## Exit Gate

Phase 2 is complete when:

- no handler contains ad hoc `params.agents ?? params.agent` normalization;
- no valid payload can produce an empty normalized agent list;
- no payload with both aliases can succeed;
- no plan phase with multiple agents can succeed;
- canonical planner output remains unchanged;
- persisted state remains backward-compatible;
- all generated runtime bundles expose identical behavior;
- focused tests and `check:source` pass from a clean working tree.
