# Package Surface Inventory

Date: 2026-07-09

## Scope

This inventory records the Phase 7 package-size decision from the codebase
reduction plan. It measures `npm pack --dry-run --json` before and after the
package policy change, then records which package docs and runtime payload
artifacts remain in npm.

The release artifact remains broader than the npm package: long-form docs and
release history stay release-allowlisted, while the npm package carries only
runtime-critical docs and generated runtime content.

## Baseline

Observed before Phase 7 edits:

| Metric | Value |
| --- | ---: |
| npm entries | 346 |
| packed bytes | 356,457 |
| unpacked bytes | 1,267,664 |
| `docs/` unpacked bytes | 129,021 |
| `CHANGELOG.md` unpacked bytes | 61,170 |
| `EXAMPLES.md` unpacked bytes | 13,447 |
| raw runtime content payload bytes | 407,624 |
| gzip runtime content payload bytes | 137,790 |

Top package buckets before Phase 7:

| Bucket | Entries | Unpacked bytes |
| --- | ---: | ---: |
| `dist` | 134 | 792,139 |
| `docs` | 10 | 129,021 |
| `claude` | 67 | 93,449 |
| `CHANGELOG.md` | 1 | 61,170 |
| `qwen` | 40 | 32,986 |
| `agents` | 39 | 31,481 |
| `plugins` | 25 | 21,795 |
| `QWEN.md` | 1 | 18,284 |
| `GEMINI.md` | 1 | 17,471 |
| `commands` | 13 | 16,490 |
| `EXAMPLES.md` | 1 | 13,447 |
| `README.md` | 1 | 12,332 |

## Decision

The package policy now:

- writes `dist/src/generated/runtime-content-registry.txt.gz` and records
  `payloadEncoding: "gzip"` in `runtime-content-registry.json`
- keeps runtime content lookup compatible with older uncompressed registries
- removes `CHANGELOG.md`, `EXAMPLES.md`, and top-level `docs/*.md` from the npm
  package projection
- keeps `README.md`, `LICENSE`, `GEMINI.md`, `QWEN.md`, runtime-local plugin
  README files, generated runtime surfaces, and compiled runtime entrypoints in
  npm
- keeps the pruned long-form docs in the release projection so release bundles
  still carry architecture, CI, usage, runtime, examples, and changelog context

## After

Observed after Phase 7 edits:

| Metric | Value |
| --- | ---: |
| npm entries | 334 |
| packed bytes | 299,140 |
| unpacked bytes | 794,119 |
| contains `CHANGELOG.md` | no |
| contains `EXAMPLES.md` | no |
| contains `docs/` | no |
| contains `runtime-content-registry.txt.gz` | yes |
| contains `runtime-content-registry.txt` | no |

Top package buckets after Phase 7:

| Bucket | Entries | Unpacked bytes |
| --- | ---: | ---: |
| `dist` | 134 | 522,535 |
| `claude` | 67 | 93,449 |
| `qwen` | 40 | 32,986 |
| `agents` | 39 | 31,481 |
| `plugins` | 25 | 21,795 |
| `QWEN.md` | 1 | 18,284 |
| `GEMINI.md` | 1 | 17,471 |
| `commands` | 13 | 16,490 |
| `README.md` | 1 | 12,332 |
| `LICENSE` | 1 | 11,357 |
| `package.json` | 1 | 4,621 |

Net package change:

| Metric | Change |
| --- | ---: |
| npm entries | -12 |
| packed bytes | -57,317 |
| unpacked bytes | -473,545 |
| `dist` unpacked bytes | -269,604 |
| long-form docs and changelog unpacked bytes | -203,638 |

## Validation

Observed focused validation:

| Command | Result |
| --- | --- |
| `npm run build` | Passed; copied 11 runtime asset files to `dist/src` |
| focused package/runtime suite | Passed: 96 tests, 9 suites, 0 failures |
| `npm pack --dry-run --json` | Passed with 334 files, 299,140 packed bytes, 794,119 unpacked bytes |

The focused suite included package install/startup, release artifact packaging,
runtime payload contract, compressed registry content serving, package policy,
artifact inventory, and doc-drift guards.
