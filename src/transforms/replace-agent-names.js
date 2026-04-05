const shared = require('../runtimes/shared');

function replaceAgentNames(content, runtime) {
  if (runtime.agentNaming === 'kebab-case') return content;
  let result = content;
  for (const name of shared.agentNames) {
    if (!name.includes('-')) continue;
    const snakeName = name.replace(/-/g, '_');
    const pattern = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    result = result.replace(pattern, snakeName);
  }
  return result;
}
module.exports = replaceAgentNames;
