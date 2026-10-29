# Upstream and local changes

- Source: https://github.com/Refueled/pi-bg-run
- Reviewed commit: `6487bd74e5ff49926b6d45be680be8a39e31b057`
- Upstream version: `0.1.0`
- Local version: `0.1.0-orca.1`
- Reviewed 2026-10-29 UTC. The checkout was downloaded without running install hooks, builds, or package runners. There are no runtime dependencies to install; Pi supplies the declared peers.

The runtime source was read before execution. Its shell evaluation, process termination, log cleanup, completion messages, and cache-warming override are intentional capabilities, not a sandbox. Upstream's postinstall edits settings, silently in non-interactive environments. This fork removes that hook and does not ship its installer or installer test. Experimental upstream scripts are not included. No secrets, credentials, session state, or machine-specific terminal handles belong in this directory.

Local changes:

- Adds `src/orca.ts`, the `orca` tool option, and `terminal_handle` results. Keeps Herdr support and detached execution.
- Uses Orca's explicit workspace and terminal handles for create, split, rename, and close. Refuses remote/Windows visible tasks, ambiguous launch retry, and unconfirmed kills. Never falls back to detached execution after an Orca launch attempt.
- Adds a private wrapper PID file as an execution handshake and extends crash cleanup to close the owned Orca handle.
- Makes new log directories private and new task logs mode `0600`.
- Rejects invalid PIDs before detached process signaling. This also prevents synthetic test PIDs from reaching real process termination.
- Clears warming status even when shutdown cleanup throws. Documents the actual shutdown/reload behavior instead of promising running-task retention across reload.
- Adds adapter, process-safety, and opt-in live Orca tests. Adds a test-only host TypeBox resolver so wiring tests run without dependency installation.
- Replaces the upstream README with local usage and limitations. Preserves upstream MIT and third-party notices.

Validation covers tool registration, task lifecycle and output, warming decisions, mock Orca launch ambiguity and close failures, plus live local Orca tabs/splits, success, retained failure, cancellation, timeout, and detached mode. It does not establish containment of escaped processes, full remote/Windows support, provider-side cache retention, or actual cache billing. No automatic updates are configured; re-review upstream changes before replacing this fork.
