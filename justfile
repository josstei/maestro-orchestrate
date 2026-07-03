# Maestro Orchestrate — development commands

# List available commands with descriptions
help:
    @echo "Maestro Orchestrate — development commands"
    @echo ""
    @echo "Generator:"
    @echo "  just generate         Generate all runtime files from src/"
    @echo "  just dry-run          Preview what would change without writing"
    @echo "  just diff             Show unified diff of what would change"
    @echo "  just clean            Delete all generated files and regenerate"
    @echo "  just dev-load-claude  Build dist/claude-plugin/ and print the claude --plugin-dir command"
    @echo ""
    @echo "Testing:"
    @echo "  just test             Run all tests"
    @echo "  just test-transforms  Run only transform unit tests"
    @echo "  just test-integration Run only integration tests"
    @echo ""
    @echo "CI:"
    @echo "  just source-check     Generate, drift-check, layer-check, and test"
    @echo "  just release-check    Verify npm and release artifact surfaces"
    @echo "  just check            Generate + verify zero drift"
    @echo "  just ci               Source CI equivalent"
    @echo ""
    @echo "Maintenance:"
    @echo "  just cleanup-branches Delete local branches whose remote is gone"

# Generate all runtime files from src/
generate:
    node scripts/generate.js

# Preview what the generator would change
dry-run:
    node scripts/generate.js --dry-run

# Show unified diff of what the generator would change
diff:
    node scripts/generate.js --diff

# Clean all generated files and regenerate from scratch
clean:
    node scripts/generate.js --clean
    node scripts/generate.js

# Assemble a self-contained local Claude plugin and print the one-step load command
dev-load-claude: generate
    node scripts/assemble-claude-plugin.js

# Run all tests
test:
    npm test

# Run only unit tests (core modules, hooks, handlers)
test-unit:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=(tests/unit/*.test.js)
    if [ ${#files[@]} -eq 0 ]; then echo "No unit test files found"; exit 1; fi
    node --test "${files[@]}"

# Run only transform unit tests
test-transforms:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=(tests/transforms/*.test.js)
    if [ ${#files[@]} -eq 0 ]; then echo "No transform test files found"; exit 1; fi
    node --test "${files[@]}"

# Run only integration tests
test-integration:
    #!/usr/bin/env bash
    set -euo pipefail
    shopt -s nullglob
    files=(tests/integration/*.test.js)
    if [ ${#files[@]} -eq 0 ]; then echo "No integration test files found"; exit 1; fi
    node --test "${files[@]}"

# Generate and verify zero drift (what CI runs)
check: generate
    #!/usr/bin/env bash
    if ! git diff --exit-code --name-only; then
        echo "ERROR: Generated files are out of sync with source. Run 'just generate' and commit."
        git diff --stat
        exit 1
    fi
    echo "No drift detected."

# Verify lib/ layer boundary (no imports outside lib/ or node:*)
check-layers:
    node scripts/check-layer-boundaries.js

# Generate, drift-check, layer-check, and test source changes
source-check:
    npm run check:source

# Verify npm package contents and release artifact surfaces
release-check:
    npm run check:release

# Generate, test, and verify — source CI equivalent
ci: source-check

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
