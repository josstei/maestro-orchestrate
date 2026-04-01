'use strict';

const { normalizeInput, formatOutput } = require('./hook-adapter');
const { handleSessionEnd } = require('../lib/hooks/session-end-logic.js');

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  try {
    const raw = JSON.parse(Buffer.concat(chunks).toString());
    const ctx = normalizeInput(raw);
    Promise.resolve(handleSessionEnd(ctx))
      .then((result) => {
        const output = formatOutput(result);
        process.stdout.write(JSON.stringify(output) + '\n');
      })
      .catch((err) => {
        process.stderr.write('Hook error: ' + err.message + '\n');
        process.stdout.write(JSON.stringify({ "continue": true, "decision": "approve" }) + '\n');
      });
  } catch (err) {
    process.stderr.write('Hook parse error: ' + err.message + '\n');
    process.stdout.write(JSON.stringify({ "continue": true, "decision": "approve" }) + '\n');
  }
});
