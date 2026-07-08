import { ValidationError } from '../../lib/errors/index.js';
import { requireNonEmptyString } from '../../lib/validation/index.js';
import { MemoryStore } from '../memory/memory-store.js';
const RATING_VALUES = Object.freeze(['up', 'down']);

/**
 * @param {unknown} value
 * @returns {number|string}
 */
function requirePhaseId(value: any) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new ValidationError('phase_id is required and must be a number or non-empty string');
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeNote(value: any) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Record a human-satisfaction rating for a whole session or a single phase.
 * `target` selects the scope; `phase_id` is required when `target` is
 * 'phase' (a cross-field rule the flat raw-shape schema cannot express, so
 * it is enforced here). Persisted record shapes are identical to the
 * pre-merge rate_phase/rate_session records.
 *
 * @param {{ target: 'phase'|'session', session_id: string, phase_id?: number|string, rating: 'up'|'down', note?: string }} params
 * @param {string} projectRoot
 * @returns {{ recorded: true, rating: object }}
 */
function handleRate(params: any, projectRoot: any) {
  const record =
    params.target === 'phase'
      ? {
          session_id: requireNonEmptyString(params.session_id, 'session_id'),
          phase_id: requirePhaseId(params.phase_id),
          rating: params.rating,
          note: normalizeNote(params.note),
          at: new Date().toISOString(),
        }
      : {
          session_id: requireNonEmptyString(params.session_id, 'session_id'),
          rating: params.rating,
          note: normalizeNote(params.note),
          at: new Date().toISOString(),
        };
  new MemoryStore(projectRoot).appendRating(record);
  return { recorded: true, rating: record };
}

/**
 * Deterministic thumbs-up/down rollup over stored rating records. Records with
 * a rating outside RATING_VALUES (or non-object entries) are ignored. The
 * satisfaction ratio is up / (up + down), rounded to two decimals, 0 when empty.
 *
 * @param {Array<{ session_id?: string, rating?: string }>} ratings
 * @returns {{ total: number, up: number, down: number, satisfaction_ratio: number, by_session: Record<string, { up: number, down: number }> }}
 */
function aggregateRatings(ratings: any) {
  const list = Array.isArray(ratings) ? ratings : [];
  const bySession: Record<string, any> = {};
  let up = 0;
  let down = 0;
  for (const entry of list) {
    if (!entry || !RATING_VALUES.includes(entry.rating)) {
      continue;
    }
    const sessionId =
      typeof entry.session_id === 'string' && entry.session_id.length > 0
        ? entry.session_id
        : 'unknown';
    if (!bySession[sessionId]) {
      bySession[sessionId] = { up: 0, down: 0 };
    }
    bySession[sessionId][entry.rating] += 1;
    if (entry.rating === 'up') {
      up += 1;
    } else {
      down += 1;
    }
  }
  const total = up + down;
  return {
    total,
    up,
    down,
    satisfaction_ratio: total > 0 ? Math.round((up / total) * 100) / 100 : 0,
    by_session: bySession,
  };
}

export { RATING_VALUES, handleRate, aggregateRatings };
