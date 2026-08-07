import { recordPhaseFailure } from '../session/session-lifecycle-service.js';

/**
 * MCP Tool Handler for recording subagent delegation failures on an active Maestro session phase.
 *
 * @param params
 * @param ctx
 */
export function handleRecordPhaseFailure(params: any, ctx: any = {}) {
  const projectRoot = ctx.projectRoot;
  return recordPhaseFailure(params, projectRoot);
}
