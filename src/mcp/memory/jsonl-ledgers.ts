import path from 'path';
import { appendJsonLine, readJsonLines } from '../../lib/io/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';

const PLAN_ACCURACY_LEDGER = 'plan-accuracy.jsonl';
const RATINGS_LEDGER = 'ratings.jsonl';

function knowledgeJsonlPath(projectRoot: any, filename: any) {
  return path.join(resolveStateDirPath(projectRoot), 'knowledge', filename);
}

function readKnowledgeJsonl(projectRoot: any, filename: any) {
  return readJsonLines(knowledgeJsonlPath(projectRoot, filename));
}

function appendKnowledgeJsonl(projectRoot: any, filename: any, record: any) {
  return appendJsonLine(knowledgeJsonlPath(projectRoot, filename), record);
}

function readRatings(projectRoot: any) {
  return readKnowledgeJsonl(projectRoot, RATINGS_LEDGER);
}

function appendRating(projectRoot: any, record: any) {
  return appendKnowledgeJsonl(projectRoot, RATINGS_LEDGER, record);
}

function readPlanAccuracy(projectRoot: any) {
  return readKnowledgeJsonl(projectRoot, PLAN_ACCURACY_LEDGER);
}

function appendPlanAccuracy(projectRoot: any, record: any) {
  return appendKnowledgeJsonl(projectRoot, PLAN_ACCURACY_LEDGER, record);
}

export {
  PLAN_ACCURACY_LEDGER,
  RATINGS_LEDGER,
  appendPlanAccuracy,
  appendRating,
  readPlanAccuracy,
  readRatings,
};
