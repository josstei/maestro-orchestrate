import { z } from 'zod';

export const PHASE_ID = z.union([z.number().int(), z.string()]);
export type PhaseIdInput = z.infer<typeof PHASE_ID>;

export const FILE_ARRAY = z.array(z.string());
export type FileArrayInput = z.infer<typeof FILE_ARRAY>;

const strOrArr = z.union([z.string(), z.array(z.string())]).optional();

export const DOWNSTREAM_CONTEXT = z.object({
  key_interfaces_introduced: strOrArr,
  patterns_established: strOrArr,
  integration_points: strOrArr,
  assumptions: strOrArr,
  warnings: strOrArr,
}).passthrough();
export type DownstreamContextInput = z.infer<typeof DOWNSTREAM_CONTEXT>;

export const PHASE_ITEM = z.object({
  id: PHASE_ID,
  name: z.string().min(1),
  agent: z.string().min(1),
  parallel: z.boolean(),
  blocked_by: z.array(PHASE_ID),
  files: z.array(z.string().min(1)).optional(),
}).passthrough();
export type PhaseItemInput = z.infer<typeof PHASE_ITEM>;
