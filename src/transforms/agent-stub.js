const { extractValue } = require('../core/frontmatter-parser');
const { toKebabCase } = require('../core/agent-names');

function canonicalAgentName(name, runtime) {
  if (!name) return name;
  if (runtime.agentNaming === 'snake_case') {
    return toKebabCase(name);
  }
  return name;
}

function replaceBodyWithStub(content, stubBody) {
  if (!content.startsWith('---\n')) {
    return stubBody;
  }

  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return content + '\n' + stubBody;
  }

  return content.slice(0, end + 5) + '\n' + stubBody;
}

function agentStub(content, runtime) {
  const name = canonicalAgentName(extractValue(content, 'name') || '', runtime);
  const stubBody =
    `Agent methodology loaded via MCP tool \`get_agent\`. ` +
    `Call \`get_agent(agents: ["${name}"])\` to read the full methodology at delegation time.\n`;

  return replaceBodyWithStub(content, stubBody);
}

module.exports = agentStub;
