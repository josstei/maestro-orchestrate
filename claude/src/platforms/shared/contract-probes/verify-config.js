'use strict';

/**
 * Verifies a runtime-config's delegation section is achievable given the
 * observed runtime contract. Throws ConfigContractMismatchError on drift.
 *
 * @module verify-config
 */

/**
 * @class ConfigContractMismatchError
 * @extends Error
 * @property {string} code - Always 'CONFIG_CONTRACT_MISMATCH'
 * @property {object} details - Structured data about the mismatch
 */
class ConfigContractMismatchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.code = 'CONFIG_CONTRACT_MISMATCH';
    this.details = details;
  }
}

const TEMPLATE_PATTERN = /^\{\{.+\}\}$/;
const TOOL_NAME_HEAD = /^\s*(\{\{[^}]+\}\}|[a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;

/**
 * Extracts the leading function-name token from a delegation pattern string.
 * Returns null if the pattern is malformed (no leading identifier or template).
 *
 * @param {string} pattern
 * @returns {string|null}
 */
function extractDelegationToolName(pattern) {
  const match = TOOL_NAME_HEAD.exec(pattern || '');
  return match ? match[1] : null;
}

/**
 * Returns true if the tool name is an unresolved `{{...}}` template literal.
 *
 * @param {string} toolName
 * @returns {boolean}
 */
function isUnresolvedTemplate(toolName) {
  return typeof toolName === 'string' && TEMPLATE_PATTERN.test(toolName);
}

/**
 * Verifies a runtime-config object against an observed RuntimeContract.
 *
 * Checks (in order):
 * 1. delegation.pattern must be parseable (has a leading function-name token)
 * 2. The extracted tool name must not be an unresolved `{{...}}` template
 * 3. The extracted tool name must appear in contract.registered_tools
 * 4. If requires_frontmatter_enforcement is true, contract.frontmatter_enforcement must be 'enforced'
 *
 * @param {object} config - The loaded runtime-config object
 * @param {import('./types').RuntimeContract} contract - The observed runtime contract
 * @throws {ConfigContractMismatchError}
 */
function verifyConfigAgainstContract(config, contract) {
  const declared = config?.delegation?.pattern || '';
  const declaredTool = extractDelegationToolName(declared);

  if (!declaredTool) {
    throw new ConfigContractMismatchError(
      `runtime-config.delegation.pattern is malformed: ${JSON.stringify(declared)}`,
      { declared }
    );
  }

  if (isUnresolvedTemplate(declaredTool)) {
    throw new ConfigContractMismatchError(
      `runtime-config.delegation.pattern contains an unresolved template '${declaredTool}'. ` +
        `Templates must be resolved at generation time before verification.`,
      { declared_tool: declaredTool }
    );
  }

  if (!contract.registered_tools.includes(declaredTool)) {
    throw new ConfigContractMismatchError(
      `runtime-config declares delegation tool '${declaredTool}' but it is not in the runtime's registered_tools`,
      { declared_tool: declaredTool, registered_tools: contract.registered_tools }
    );
  }

  if (
    config.delegation.requires_frontmatter_enforcement === true &&
    contract.frontmatter_enforcement !== 'enforced'
  ) {
    throw new ConfigContractMismatchError(
      `runtime-config requires frontmatter enforcement but contract reports '${contract.frontmatter_enforcement}'`,
      { required: 'enforced', actual: contract.frontmatter_enforcement }
    );
  }
}

module.exports = {
  verifyConfigAgainstContract,
  ConfigContractMismatchError,
};
