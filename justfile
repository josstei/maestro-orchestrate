# Maestro Orchestrate — development commands

# List available commands with descriptions
help:
    @just --list

# Generate all runtime files from src/
generate:
    node scripts/generate.js

# Preview what the generator would change
dry-run:
    node scripts/generate.js --dry-run

# Show unified diff of what the generator would change
diff:
    node scripts/generate.js --diff

# Delete the generated agent and shared-skill stubs, then regenerate
clean:
    node scripts/generate.js --clean

# Run all tests
test:
    npm test

# Run only unit tests (core modules, hooks, handlers)
test-unit: (_node-test "unit test" "tests/unit/*.test.js")

# Run only transform unit tests
test-transforms: (_node-test "transform test" "tests/transforms/*.test.js")

# Run only integration tests
test-integration: (_node-test "integration test" "tests/integration/*.test.js")

_node-test label globs:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=({{globs}})
    if [ ${#files[@]} -eq 0 ]; then echo "No {{label}} files found"; exit 1; fi
    node --test "${files[@]}"

# Generate and verify zero drift with git diff (CI runs generate.js --check)
check: generate
    #!/usr/bin/env bash
    if ! git diff --exit-code --name-only; then
        echo "ERROR: Generated files are out of sync with source. Run 'just generate' and commit."
        git diff --stat
        exit 1
    fi
    echo "No drift detected."

# Verify lower-layer dependencies (lib, core, config, state and hooks)
check-layers:
    node scripts/check-layer-boundaries.js

# Check drift, test, and verify the npm package and release archive — full CI equivalent
ci: check test
    npm run pack:verify
    npm run release:artifacts
    npm run release:verify-artifacts

# Delete local branches whose remote tracking ref is gone
cleanup-branches:
    #!/usr/bin/env bash
    set -euo pipefail
    git fetch --prune
    GONE=$(git branch -vv | grep ': gone]' | awk '{print $1}' || true)
    if [ -n "$GONE" ]; then
        echo "Deleting branches with gone remotes:"
        echo "$GONE" | xargs git branch -d
    else
        echo "No branches with gone remotes."
    fi
    echo ""
    echo "Unmerged branches (review manually):"
    git branch --no-merged main 2>/dev/null || echo "  (none)"
