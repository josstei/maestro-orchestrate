import { TimelineEvent, TimelineEventSchema } from './evidence-schema.js';

export class TimelineRecorder {
  private startTimeMs: number;
  private events: TimelineEvent[] = [];

  constructor(startTimeMs?: number) {
    this.startTimeMs = startTimeMs ?? Date.now();
  }

  public recordEvent(params: {
    stage_id: string;
    operation: string;
    duration_ms?: number | null;
    outcome: 'success' | 'failed' | 'in_progress' | 'skipped';
    linked_mcp_call_ids?: string[];
    error_code?: string | null;
    timestamp?: string;
  }): TimelineEvent {
    const nowMs = Date.now();
    const offset_ms = Math.max(0, nowMs - this.startTimeMs);
    const timestamp = params.timestamp ?? new Date(nowMs).toISOString();

    const event: TimelineEvent = TimelineEventSchema.parse({
      offset_ms,
      timestamp,
      stage_id: params.stage_id,
      operation: params.operation,
      duration_ms: params.duration_ms ?? null,
      outcome: params.outcome,
      linked_mcp_call_ids: params.linked_mcp_call_ids ?? [],
      error_code: params.error_code ?? null,
    });

    this.events.push(event);
    return event;
  }

  public getEvents(): TimelineEvent[] {
    return [...this.events];
  }

  public exportTimelineJson(): string {
    return JSON.stringify(this.events, null, 2) + '\n';
  }
}
