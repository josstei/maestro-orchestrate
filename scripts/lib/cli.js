'use strict';
const fs = require('node:fs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runAsMain(currentModule, label, fn) {
  if (currentModule !== require.main) return;
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      console.error(`${label} failed: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { readJson, runAsMain };
