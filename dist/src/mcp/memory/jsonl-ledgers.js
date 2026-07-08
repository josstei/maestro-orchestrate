import path from 'path';
import { appendJsonLine, readJsonLines } from '../../lib/io/index.js';
import { resolveStateDirPath } from '../../state/session-state.js';
const PLAN_ACCURACY_LEDGER = 'plan-accuracy.jsonl';
const RATINGS_LEDGER = 'ratings.jsonl';
function knowledgeJsonlPath(projectRoot, filename) {
    return path.join(resolveStateDirPath(projectRoot), 'knowledge', filename);
}
function readKnowledgeJsonl(projectRoot, filename) {
    return readJsonLines(knowledgeJsonlPath(projectRoot, filename));
}
function appendKnowledgeJsonl(projectRoot, filename, record) {
    return appendJsonLine(knowledgeJsonlPath(projectRoot, filename), record);
}
function readRatings(projectRoot) {
    return readKnowledgeJsonl(projectRoot, RATINGS_LEDGER);
}
function appendRating(projectRoot, record) {
    return appendKnowledgeJsonl(projectRoot, RATINGS_LEDGER, record);
}
function readPlanAccuracy(projectRoot) {
    return readKnowledgeJsonl(projectRoot, PLAN_ACCURACY_LEDGER);
}
function appendPlanAccuracy(projectRoot, record) {
    return appendKnowledgeJsonl(projectRoot, PLAN_ACCURACY_LEDGER, record);
}
export { PLAN_ACCURACY_LEDGER, RATINGS_LEDGER, appendPlanAccuracy, appendRating, readPlanAccuracy, readRatings, };
