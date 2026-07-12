import { z } from 'zod';
import { DownstreamContextSchema } from '../contracts/downstream-context.js';
import {
  FileArraySchema,
  WirePhaseIdSchema,
  WirePlanPhaseSchema,
} from '../contracts/plan-schema.js';

export const PHASE_ID = WirePhaseIdSchema;
export type PhaseIdInput = z.infer<typeof PHASE_ID>;

export const FILE_ARRAY = FileArraySchema;
export type FileArrayInput = z.infer<typeof FILE_ARRAY>;

export const DOWNSTREAM_CONTEXT = DownstreamContextSchema;
export type DownstreamContextInput = z.infer<typeof DOWNSTREAM_CONTEXT>;

export const PHASE_ITEM = WirePlanPhaseSchema;
export type PhaseItemInput = z.infer<typeof PHASE_ITEM>;
