#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SCRIPT="$PROJECT_ROOT/scripts/read-active-session.sh"

echo "=== Test: read-active-session script ==="

echo "Test 1: Default behavior returns 'No active session' when missing"
TEMP_PROJECT_1="$(mktemp -d)"
OUTPUT="$(cd "$TEMP_PROJECT_1" && bash "$SCRIPT")"
if [[ "$OUTPUT" == "No active session" ]]; then
  echo "PASS: Missing state returns fallback message"
else
  echo "FAIL: Expected 'No active session', got: $OUTPUT"
  exit 1
fi
rm -rf "$TEMP_PROJECT_1"

echo "Test 2: Reads default .gemini state when present"
TEMP_PROJECT_2="$(mktemp -d)"
mkdir -p "$TEMP_PROJECT_2/.gemini/state"
cat > "$TEMP_PROJECT_2/.gemini/state/active-session.md" <<'STATE'
---
session_id: default-state
status: in_progress
---
default marker
STATE
OUTPUT="$(cd "$TEMP_PROJECT_2" && bash "$SCRIPT")"
if [[ "$OUTPUT" == *"default marker"* ]]; then
  echo "PASS: Default state file read successfully"
else
  echo "FAIL: Default state file not read"
  exit 1
fi
rm -rf "$TEMP_PROJECT_2"

echo "Test 3: Honors MAESTRO_STATE_DIR relative override"
TEMP_PROJECT_3="$(mktemp -d)"
mkdir -p "$TEMP_PROJECT_3/.maestro/state"
cat > "$TEMP_PROJECT_3/.maestro/state/active-session.md" <<'STATE'
---
session_id: relative-state
status: in_progress
---
relative marker
STATE
OUTPUT="$(cd "$TEMP_PROJECT_3" && MAESTRO_STATE_DIR=".maestro" bash "$SCRIPT")"
if [[ "$OUTPUT" == *"relative marker"* ]]; then
  echo "PASS: Relative override read successfully"
else
  echo "FAIL: Relative override not applied"
  exit 1
fi
rm -rf "$TEMP_PROJECT_3"

echo "Test 4: Honors MAESTRO_STATE_DIR absolute override"
TEMP_PROJECT_4="$(mktemp -d)"
ABS_STATE_DIR="$(mktemp -d)"
mkdir -p "$ABS_STATE_DIR/state"
cat > "$ABS_STATE_DIR/state/active-session.md" <<'STATE'
---
session_id: absolute-state
status: in_progress
---
absolute marker
STATE
OUTPUT="$(cd "$TEMP_PROJECT_4" && MAESTRO_STATE_DIR="$ABS_STATE_DIR" bash "$SCRIPT")"
if [[ "$OUTPUT" == *"absolute marker"* ]]; then
  echo "PASS: Absolute override read successfully"
else
  echo "FAIL: Absolute override not applied"
  exit 1
fi
rm -rf "$TEMP_PROJECT_4" "$ABS_STATE_DIR"

echo "Test 5: Uses workspace .env when MAESTRO_STATE_DIR is unset"
TEMP_PROJECT_5="$(mktemp -d)"
cat > "$TEMP_PROJECT_5/.env" <<'ENV'
MAESTRO_STATE_DIR=.custom-state
ENV
mkdir -p "$TEMP_PROJECT_5/.custom-state/state"
cat > "$TEMP_PROJECT_5/.custom-state/state/active-session.md" <<'STATE'
---
session_id: env-state
status: in_progress
---
env marker
STATE
OUTPUT="$(cd "$TEMP_PROJECT_5" && bash "$SCRIPT")"
if [[ "$OUTPUT" == *"env marker"* ]]; then
  echo "PASS: Workspace .env override applied"
else
  echo "FAIL: Workspace .env override not applied"
  exit 1
fi
rm -rf "$TEMP_PROJECT_5"

echo "Test 6: Uses extension .env fallback when workspace .env is absent"
TEMP_PROJECT_6="$(mktemp -d)"
TEMP_HOME_6="$(mktemp -d)"
mkdir -p "$TEMP_HOME_6/.gemini/extensions/maestro"
cat > "$TEMP_HOME_6/.gemini/extensions/maestro/.env" <<'ENV'
MAESTRO_STATE_DIR=.ext-state
ENV
mkdir -p "$TEMP_PROJECT_6/.ext-state/state"
cat > "$TEMP_PROJECT_6/.ext-state/state/active-session.md" <<'STATE'
---
session_id: extension-env-state
status: in_progress
---
extension env marker
STATE
OUTPUT="$(cd "$TEMP_PROJECT_6" && HOME="$TEMP_HOME_6" bash "$SCRIPT")"
if [[ "$OUTPUT" == *"extension env marker"* ]]; then
  echo "PASS: Extension .env fallback applied"
else
  echo "FAIL: Extension .env fallback not applied"
  exit 1
fi
rm -rf "$TEMP_PROJECT_6" "$TEMP_HOME_6"

echo "Test 7: Honors MAESTRO_EXTENSION_PATH for extension .env fallback"
TEMP_PROJECT_7="$(mktemp -d)"
TEMP_EXTENSION_7="$(mktemp -d)"
mkdir -p "$TEMP_EXTENSION_7"
cat > "$TEMP_EXTENSION_7/.env" <<'ENV'
MAESTRO_STATE_DIR=.ext-path-state
ENV
mkdir -p "$TEMP_PROJECT_7/.ext-path-state/state"
cat > "$TEMP_PROJECT_7/.ext-path-state/state/active-session.md" <<'STATE'
---
session_id: extension-path-state
status: in_progress
---
extension path marker
STATE
OUTPUT="$(cd "$TEMP_PROJECT_7" && MAESTRO_EXTENSION_PATH="$TEMP_EXTENSION_7" bash "$SCRIPT")"
if [[ "$OUTPUT" == *"extension path marker"* ]]; then
  echo "PASS: MAESTRO_EXTENSION_PATH fallback applied"
else
  echo "FAIL: MAESTRO_EXTENSION_PATH fallback not applied"
  exit 1
fi
rm -rf "$TEMP_PROJECT_7" "$TEMP_EXTENSION_7"

echo "=== All read-active-session script tests passed ==="
