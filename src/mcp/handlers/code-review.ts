import { recordCodeReview } from '../session/session-lifecycle-service.js';

/**
 * MCP Tool Handler for recording code review outcomes on an active Maestro session.
 *
 * @param params
 * @param ctx
 */
export function handleRecordCodeReview(params: any, ctx: any = {}) {
  const projectRoot = ctx.projectRoot;
  return recordCodeReview(params, projectRoot);
}
