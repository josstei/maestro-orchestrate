'use strict';

/**
 * @param {string} text - Full text of an agent Task Report.
 * @returns {{ question: string, context: string, required: string }[]}
 */
function parseBlockers(text) {
  if (typeof text !== 'string' || text.length === 0) return [];

  const sectionMatch = text.match(/^#{1,6}\s+Blockers\s*$/im);
  if (!sectionMatch) return [];

  const sectionStart = sectionMatch.index + sectionMatch[0].length;
  const rest = text.slice(sectionStart);
  const nextSectionMatch = rest.match(/^#{1,6}\s+\w/im);
  const sectionBody = nextSectionMatch
    ? rest.slice(0, nextSectionMatch.index)
    : rest;

  const blockers = [];
  const blockerRe =
    /-\s*BLOCKER:\s*(.+?)\n\s+Context:\s*(.+?)\n\s+Required to proceed:\s*(.+?)(?=\n-\s*BLOCKER:|\n\s*$|$)/gis;
  let match;
  while ((match = blockerRe.exec(sectionBody)) !== null) {
    blockers.push({
      question: match[1].trim(),
      context: match[2].trim(),
      required: match[3].trim(),
    });
  }
  return blockers;
}

module.exports = { parseBlockers };
