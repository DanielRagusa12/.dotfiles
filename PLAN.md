# Piped Item Command Runner — Implementation Plan

## Context

Build a small terminal program that:

1. reads candidate items from standard input,
2. opens an interactive multi-select UI on the controlling terminal,
3. prompts for a command template,
4. runs that command once for every selected item.

A key design constraint is that stdin carries piped data, so all interactive input/output must use `/dev/tty` (or the platform equivalent), not stdin.

This chezmoi repository does not currently contain an application scaffold (no root `go.mod`, `Cargo.toml`, or `package.json`). The eventual project location and distribution model still need to be decided.

## Approach

Tentative recommendation: implement this as a standalone **Go** CLI. Go is a good fit because it produces a single portable binary, starts quickly, has strong process/terminal APIs, and is simpler to distribute than a runtime-dependent script. Use a terminal UI library for fuzzy/multi-selection and a line editor/history-capable prompt for the command template, while keeping parsing and process execution in small testable packages.

The command-template contract, execution concurrency/failure behavior, supported input format, and target platforms remain to be confirmed before finalizing the design.

## Files to modify

Exact paths are pending the decision about whether this belongs in this dotfiles repository or a separate repository. Expected standalone layout:

- `go.mod`, `go.sum` — pinned Go module dependencies
- `cmd/<program>/main.go` — CLI entry point and exit-code handling
- `internal/input/...` — piped-item ingestion and validation
- `internal/ui/...` — controlling-terminal multi-select and command prompt
- `internal/command/...` — template expansion and child-process execution
- package-level `_test.go` files — unit/integration tests
- `README.md` — usage, examples, shell quoting, and install instructions
- release workflow/configuration — optional cross-platform binaries

## Reuse

- No reusable application utilities were found in this repository during the initial scan.
- Existing third-party terminal components will be selected after requirements are clarified; avoid implementing terminal raw mode and key handling from scratch.

## Steps

- [ ] Confirm product semantics, target platforms, repository location, and program name.
- [ ] Scaffold the Go module and minimal CLI with documented usage and exit codes.
- [ ] Implement bounded stdin ingestion, normalization, and clear errors for missing/non-piped/empty input.
- [ ] Implement interactive multi-select using the controlling terminal, with keyboard help and cancellation handling.
- [ ] Implement command-template prompting and validation.
- [ ] Implement safe per-item template substitution and child-process execution with explicit shell semantics.
- [ ] Add progress/result reporting, deterministic failure behavior, and signal forwarding/cancellation.
- [ ] Add unit tests for input parsing/template expansion and integration tests for process execution.
- [ ] Document pipeline examples, quoting rules, special-character behavior, and installation.
- [ ] Optionally add reproducible cross-platform release builds after core behavior is verified.

## Verification

- Run formatting, static analysis, unit tests, and race tests.
- Pipe representative newline-delimited values into the binary and verify selection through a real TTY.
- Verify empty input, duplicate entries, whitespace, Unicode, very long entries, and entries beginning with `-`.
- Verify values containing spaces, quotes, shell metacharacters, and newlines behave according to the chosen substitution contract.
- Verify selecting none, canceling either prompt, invalid templates, child-command failures, Ctrl-C, and unavailable `/dev/tty` produce documented exit codes.
- Verify that each selected item is passed exactly once and that sequential/concurrent execution matches the selected policy.
