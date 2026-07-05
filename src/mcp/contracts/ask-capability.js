/**
 * Canonical AskCapability ladder contract.
 *
 * Each Maestro runtime resolves a user-facing question through a
 * quality-first ladder of rungs: a native ask tool where one exists, then
 * successively degraded fallbacks for runtimes that lack (or restrict) that
 * capability. The ladder for a runtime is ordered from most- to
 * least-preferred rung.
 *
 * Design intent (per-runtime, current rungs):
 * - Claude has a native `AskUserQuestion` tool and needs no fallback.
 * - Gemini and Qwen (a Gemini-family fork) have a native ask tool and fall
 *   back to an informed text question when it is unavailable.
 * - Codex has no native ask tool; it prefers `request_user_input` while in
 *   Plan mode, nudges the user to take a manual action when that surface is
 *   unavailable, and falls back to an informed text question as a last
 *   resort.
 *
 * Ladders are additive: future rungs may be appended, but existing rung
 * values and order must never change. `isAdditiveLadderExtension` verifies
 * a proposed ladder change respects that invariant.
 */

const ASK_RUNG_KINDS = Object.freeze({
  NATIVE_ASK_TOOL: 'native_ask_tool',
  PLAN_MODE_REQUEST: 'plan_mode_request_user_input',
  USER_ACTION_NUDGE: 'user_action_nudge',
  INFORMED_TEXT_FALLBACK: 'informed_text_fallback',
});

const GEMINI_FAMILY_LADDER = Object.freeze([
  ASK_RUNG_KINDS.NATIVE_ASK_TOOL,
  ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK,
]);

const ASK_CAPABILITY_LADDERS = Object.freeze({
  claude: Object.freeze([ASK_RUNG_KINDS.NATIVE_ASK_TOOL]),
  gemini: GEMINI_FAMILY_LADDER,
  qwen: GEMINI_FAMILY_LADDER,
  codex: Object.freeze([
    ASK_RUNG_KINDS.PLAN_MODE_REQUEST,
    ASK_RUNG_KINDS.USER_ACTION_NUDGE,
    ASK_RUNG_KINDS.INFORMED_TEXT_FALLBACK,
  ]),
});

/**
 * Ordered AskCapability ladder for a runtime, most- to least-preferred rung.
 *
 * @param {string} runtimeName
 * @returns {ReadonlyArray<string>}
 */
function getAskCapabilityLadder(runtimeName) {
  const ladder = ASK_CAPABILITY_LADDERS[runtimeName];
  if (!ladder) {
    throw new Error(`No AskCapability ladder registered for runtime: ${runtimeName}`);
  }
  return ladder;
}

/**
 * True when `nextLadder` only appends rungs after `previousLadder`'s rungs,
 * preserving every previous rung's value and position.
 *
 * @param {ReadonlyArray<string>} previousLadder
 * @param {ReadonlyArray<string>} nextLadder
 * @returns {boolean}
 */
function isAdditiveLadderExtension(previousLadder, nextLadder) {
  if (nextLadder.length < previousLadder.length) return false;
  return previousLadder.every((rung, index) => nextLadder[index] === rung);
}

export { ASK_RUNG_KINDS, ASK_CAPABILITY_LADDERS, getAskCapabilityLadder, isAdditiveLadderExtension };
