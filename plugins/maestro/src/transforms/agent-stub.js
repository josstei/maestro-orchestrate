function extractName(content) {
  const match = content.match(/(?:^|\n)name:\s*("?)([^\n"]+)\1/);
  return match ? match[2].trim() : '';
}

function canonicalAgentName(name, runtime) {
  if (!name) return name;
  if (runtime.agentNaming === 'snake_case') {
    return name.replace(/_/g, '-');
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
  const name = canonicalAgentName(extractName(content), runtime);
  const stubBody =
    `Agent methodology loaded via MCP tool \`get_agent\`. ` +
    `Call \`get_agent(agents: ["${name}"])\` to read the full methodology at delegation time.\n`;

  return replaceBodyWithStub(content, stubBody);
}

module.exports = agentStub;
