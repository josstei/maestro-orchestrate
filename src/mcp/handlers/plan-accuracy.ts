import { appendPlanAccuracy, readPlanAccuracy } from '../memory/jsonl-ledgers.js';
import { normalizeUniqueStringList as normalizeFileList } from '../../lib/validation/index.js';

/**
 * @param {Set<string>} left
 * @param {Set<string>} right
 * @returns {number}
 */
function intersectionSize(left: any, right: any) {
  let count = 0;
  for (const item of left) {
    if (right.has(item)) count += 1;
  }
  return count;
}

/**
 * Project archived session phase manifests into one durable plan-vs-actual
 * accuracy record. Planned files come from phase `planned_files`; actual files
 * are the union of `files_created` and `files_modified`.
 *
 * @param {{ session_id?: string, phases?: Array<object> }} state
 * @param {string} projectRoot
 * @returns {object | null} appended record, or null when no phases exist
 */
function recordPlanAccuracy(state: any, projectRoot: any) {
  const phases = Array.isArray(state && state.phases) ? state.phases : [];
  if (phases.length === 0) return null;

  const planned = new Set();
  const actual = new Set();
  let totalRetries = 0;

  for (const phase of phases) {
    for (const filePath of normalizeFileList(phase.planned_files)) {
      planned.add(filePath);
    }
    for (const filePath of normalizeFileList(phase.files_created)) {
      actual.add(filePath);
    }
    for (const filePath of normalizeFileList(phase.files_modified)) {
      actual.add(filePath);
    }
    totalRetries += Number(phase.retry_count) || 0;
  }

  const plannedFileCount = planned.size;
  const actualFileCount = actual.size;
  const matchedFileCount = intersectionSize(planned, actual);
  const record = {
    session_id: (state && state.session_id) || null,
    precision:
      actualFileCount > 0 ? matchedFileCount / actualFileCount : 0,
    recall:
      plannedFileCount > 0 ? matchedFileCount / plannedFileCount : 0,
    planned_file_count: plannedFileCount,
    actual_file_count: actualFileCount,
    matched_file_count: matchedFileCount,
    phase_count: phases.length,
    total_retries: totalRetries,
    created: new Date().toISOString(),
  };

  appendPlanAccuracy(projectRoot, record);
  return record;
}

/**
 * Aggregate the durable plan-accuracy JSONL ledger into planning calibration
 * priors. Records are returned so downstream planners can inspect outliers.
 *
 * @param {object} _params
 * @param {string} projectRoot
 * @returns {{ samples:number, avg_precision:number, avg_recall:number, avg_phase_count:number, records:object[] }}
 */
function handleGetPlanAccuracy(_params: any, projectRoot: any) {
  const records = readPlanAccuracy(projectRoot) as any[];
  const samples = records.length;
  if (samples === 0) {
    return {
      samples: 0,
      avg_precision: 0,
      avg_recall: 0,
      avg_phase_count: 0,
      records: [],
    };
  }

  let totalPrecision = 0;
  let totalRecall = 0;
  let totalPhaseCount = 0;
  for (const record of records) {
    totalPrecision += Number(record.precision) || 0;
    totalRecall += Number(record.recall) || 0;
    totalPhaseCount += Number(record.phase_count) || 0;
  }

  return {
    samples,
    avg_precision: totalPrecision / samples,
    avg_recall: totalRecall / samples,
    avg_phase_count: totalPhaseCount / samples,
    records,
  };
}

export { recordPlanAccuracy, handleGetPlanAccuracy };
