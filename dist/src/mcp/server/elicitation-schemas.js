/**
 * `requestedSchema` payloads for `ctx.elicit` calls. These are sent verbatim
 * to the MCP client and validated there by the SDK against the JSON-Schema
 * spec — they are consumed by `elicitInput`, not by maestro's own tool-input
 * validation (which is zod-owned; see the per-pack zod-schemas.js files).
 * Kept out of `src/mcp/tool-packs/` and `src/mcp/handlers/` so the
 * hand-authored-JSON-Schema guard over the tool surface stays scoped to tool
 * input shapes.
 */
/**
 * `requestedSchema` for the design-gate approval consent elicitation. This is
 * a confirmation-only elicitation: the client's `action` (`accept` /
 * `decline` / `cancel`) IS the consent decision (see `§7` of the design), so
 * the schema declares no fields whose content could contradict that action.
 *
 * @returns {{type: 'object', properties: object}}
 */
function buildDesignApprovalConsentSchema() {
    return {
        type: 'object',
        properties: {},
    };
}
export { buildDesignApprovalConsentSchema };
