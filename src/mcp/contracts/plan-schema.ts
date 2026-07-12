import { z } from 'zod';

const PHASE_REQUIRED_FIELDS = [
  'id',
  'name',
  'agent',
  'parallel',
  'blocked_by',
] as const;

function isValidPhaseId(value: unknown): value is number | string {
  if (typeof value === 'string') return value.length > 0;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

const WirePhaseIdSchema = z.union([z.number().int(), z.string()]);
const PlanPhaseIdSchema = WirePhaseIdSchema.refine(isValidPhaseId);
const FileArraySchema = z.array(z.string());
const NonEmptyFileArraySchema = z.array(z.string().min(1));

const WirePlanPhaseSchema = z.object({
  id: WirePhaseIdSchema,
  name: z.string().min(1),
  agent: z.string().min(1),
  parallel: z.boolean(),
  blocked_by: z.array(WirePhaseIdSchema),
  files: NonEmptyFileArraySchema.optional(),
}).passthrough();

const PlanPhaseSchema = z.object({
  id: PlanPhaseIdSchema,
  name: z.string().min(1),
  agent: z.string().min(1),
  parallel: z.boolean(),
  blocked_by: z.array(PlanPhaseIdSchema),
  files: NonEmptyFileArraySchema.optional(),
}).passthrough();

const PlanSchema = z.object({
  phases: z.array(PlanPhaseSchema),
}).passthrough();

const PHASE_FIELD_VALIDATORS = Object.freeze([
  { field: 'id', schema: PlanPhaseSchema.shape.id, rule: 'invalid_field_type' },
  { field: 'name', schema: PlanPhaseSchema.shape.name, rule: 'invalid_field_type' },
  { field: 'agent', schema: PlanPhaseSchema.shape.agent, rule: 'invalid_field_type' },
  { field: 'parallel', schema: PlanPhaseSchema.shape.parallel, rule: 'invalid_field_type' },
  {
    field: 'blocked_by',
    schema: PlanPhaseSchema.shape.blocked_by,
    rule: 'invalid_field_type',
  },
  {
    field: 'files',
    schema: PlanPhaseSchema.shape.files.unwrap(),
    rule: 'invalid_field_value',
  },
]);

type PhaseId = z.infer<typeof PlanPhaseIdSchema>;
type WirePlanPhase = z.infer<typeof WirePlanPhaseSchema>;
type PlanPhase = z.infer<typeof PlanPhaseSchema>;
type Plan = z.infer<typeof PlanSchema>;

/**
 * Validate an array of plan-phase objects against the shared phase schema.
 *
 * Required fields per phase: id, name, agent, parallel, blocked_by.
 *
 * Optional field: `files` — the planning-time file manifest. When supplied,
 * T9 `create_session` maps it to the session state's `planned_files` field
 * for later reconciliation. The runtime-populated manifests
 * (`files_created`, `files_modified`, `files_deleted`) are NOT plan inputs;
 * they are set by `transition_phase` after an agent completes, and this
 * schema permits them to pass through unchecked since it does not reject
 * unrecognized fields. Plan authors should populate `files`, not the
 * runtime fields.
 *
 * @param {unknown} phases - Input value expected to be an array of phase objects.
 * @returns {{ valid: boolean, violations: Array<object> }}
 */
function validatePhases(phases: any) {
  const violations = [];
  if (!Array.isArray(phases)) {
    return {
      valid: false,
      violations: [
        { rule: 'invalid_phases', detail: 'phases must be an array', severity: 'error' },
      ],
    };
  }

  for (const phase of phases) {
    const phaseId = phase && phase.id;
    for (const field of PHASE_REQUIRED_FIELDS) {
      if (!phase || !Object.prototype.hasOwnProperty.call(phase, field)) {
        violations.push({
          rule: 'missing_required_field',
          phase_id: phaseId ?? null,
          field,
          severity: 'error',
        });
      }
    }

    if (!phase) continue;

    for (const { field, schema, rule } of PHASE_FIELD_VALIDATORS) {
      if (field in phase && !schema.safeParse(phase[field]).success) {
        violations.push({
          rule,
          phase_id: phaseId ?? null,
          field,
          severity: 'error',
        });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

export {
  FileArraySchema,
  PHASE_REQUIRED_FIELDS,
  PlanPhaseIdSchema,
  PlanPhaseSchema,
  PlanSchema,
  WirePhaseIdSchema,
  WirePlanPhaseSchema,
  isValidPhaseId,
  validatePhases,
};
export type { PhaseId, Plan, PlanPhase, WirePlanPhase };
