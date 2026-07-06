/**
 * Serialize a maestro `ToolOutcome` (see `./tool-outcome.js`) into an SDK
 * `CallToolResult`. Preserves the structured recovery-hint envelope
 * (`error`, `recovery_hint`, `code`, `details`) on failure so downstream
 * clients keep the same recoverability UX as the JSON-RPC dispatcher.
 *
 * @param {{ok: true, result: unknown} | {ok: false, error: string, recovery_hint: string|null, code?: string, details?: unknown}} outcome
 * @returns {{content: Array<{type: 'text', text: string}>, isError?: true}}
 */
function toolOutcomeToCallToolResult(outcome) {
  if (outcome && outcome.ok) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(outcome.result),
        },
      ],
    };
  }

  const payload = {
    error: outcome.error,
    recovery_hint: outcome.recovery_hint ?? null,
  };

  if (outcome.code) {
    payload.code = outcome.code;
  }

  if (outcome.details !== undefined) {
    payload.details = outcome.details;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
    isError: true,
  };
}

export { toolOutcomeToCallToolResult };
