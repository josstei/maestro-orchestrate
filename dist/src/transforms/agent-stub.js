import { extractValue, splitAtBoundary } from '../lib/frontmatter/index.js';
import { toKebabCase } from '../lib/naming/index.js';
function canonicalAgentName(name, runtime) {
    if (!name)
        return name;
    if (runtime.agentNaming === 'snake_case') {
        return toKebabCase(name);
    }
    return name;
}
function replaceBodyWithStub(content, stubBody) {
    const { raw } = splitAtBoundary(content);
    if (raw) {
        return '---\n' + raw + '\n---\n\n' + stubBody;
    }
    return stubBody;
}
function agentStub(content, runtime) {
    const name = canonicalAgentName(extractValue(content, 'name') || '', runtime);
    const stubBody = `Agent methodology loaded via MCP tool \`get_agent\`. ` +
        `Call \`get_agent(agents: ["${name}"])\` to read the full methodology at delegation time.\n`;
    return replaceBodyWithStub(content, stubBody);
}
export default agentStub;
