# pi-bg-run for Orca

Local fork of [Refueled/pi-bg-run](https://github.com/Refueled/pi-bg-run), pinned to upstream commit `6487bd74e5ff49926b6d45be680be8a39e31b057`. Adds Orca terminal support while preserving Herdr and detached execution. Requires Pi 1.4.0 and a local POSIX Orca workspace for visible Orca tasks.

## Install

Load this directory through `~/.pi/agent/extensions/pi-bg-run` and restart Pi or run `/reload` before starting tasks. No dependency installation or build is needed. Pi supplies TypeBox and its extension API.

This fork removes the upstream `postinstall` settings editor. It never changes your settings on install. Set `"cacheWarming": "idle"` in your user settings if wanted; it is already enabled on this machine.

## Tools

- `bg_run`: start a shell command and return its task ID.
- `bg_output`: read captured output incrementally, or use `latest: true` and an optional regex `filter`.
- `bg_tasks`: list this session's tasks.
- `bg_kill`: stop a task.
- `/bg`: select a task to inspect or stop.

Example tool input:

```json
{
  "command": "npm test",
  "label": "Tests",
  "orca": "tab",
  "timeoutSeconds": 300,
  "keepOpen": true
}
```

Inside Orca, `orca: "tab"` is the default. `orca: "pane"` splits the calling terminal vertically; it requires the calling terminal to belong to the requested workspace. `orca: "none"` runs detached. Explicit `orca` options take precedence over automatic Herdr detection. Outside Orca, execution defaults to detached unless Herdr is detected or Orca is explicitly requested.

Optional `cwd` selects the command's directory. The Orca workspace is resolved from that directory, and the wrapper also changes to it explicitly. The task result includes `terminal_handle` when running in Orca.

A completed task sends one message with its status and last output, waking an idle agent. Do not sleep or poll to wait for it. Reading progress with `bg_output` while doing other work is fine.

## Orca behavior

- Creates background tabs without requesting focus. Commands are submitted through `terminal create/split --command`, not typed into a pre-existing agent.
- Addresses only the runtime-issued handle of the terminal it created. No bulk close, active-terminal inference, or stale-handle replacement.
- A wrapper PID file confirms that execution started. A queued command receipt alone is not treated as proof.
- Closes the task's terminal after completion. `keepOpen: true` retains unsuccessful tasks and marks their terminal title with the failure. Cancellation and timeouts close the terminal.
- A failed or ambiguous launch never reruns the command detached. Inspect Orca's terminals before retrying an uncertain launch.
- A failed close is not reported as a successful kill. Cleanup failures after completion are included in the log. A stale handle after an Orca restart is not replaced automatically.
- Uses `ORCA_CLI_COMMAND` if provided, otherwise `orca-dev` in an Orca dev session, `orca-ide` on Linux outside an Orca terminal, or `orca` inside an Orca terminal and on other platforms. It never tries a second executable after a failure.
- Remote Orca workspaces and native Windows Orca tabs are refused. Use detached mode there. The inherited detached backend supports Windows with Git Bash.

`PI_BG_RUN_ORCA=off` disables automatic Orca selection. `PI_BG_RUN_ORCA=1` enables it outside an Orca terminal. An explicit `orca: "tab"` still requests Orca regardless of auto-detection.

## Cache warming

While background tasks run, the extension requests `warm` through Pi's `cache_warming_decision` hook. This overrides Pi's usual cost-benefit decision, but does not bypass the global warming setting or the model's declared cache lifetime. Refreshes consume usage and may cost money.

Idle warming requires `"cacheWarming": "idle"` and a supported physical model with a declared `promptCache` lifetime. The extension displays a status line while tasks run and warns when its configuration checks find warming unavailable. Virtual models may not expose cache metadata even when their dispatched physical model does; a warning is not proof of an actual provider cache miss.

`PI_BG_RUN_HEARTBEAT_S` controls status refresh cadence, default 100 seconds. `0` or `off` hides it. No model requests are made just to display a heartbeat. Pi owns the actual warming schedule and its idle duration limits; `/session` shows its current decision.

## Lifetime and logs

Tasks belong to the current Pi process and session. Quitting, switching sessions, or reloading kills running tasks through the shutdown handler. Wait for work to finish before reloading. Completed task records remain available in that process until session replacement.

Logs and generated scripts are stored outside this repository under `~/.pi-bg-run/<session-id>`, or `PI_BG_RUN_STATE`. New directories are private and logs use mode `0600`. They can contain command output and sensitive data; do not commit them. The inherited log limit is 100 MiB per task. Old files in a session's log directory are cleaned when that session attaches.

A separate watcher attempts to close an Orca task by its exact handle if Pi crashes. This is best-effort, not an isolation or process-containment guarantee. Commands that deliberately detach and external resources such as containers can outlive a closed terminal. The watcher never falls back to signaling a numeric Orca PID.

## Tests

With a current Node.js supporting TypeScript stripping, from the repository root:

```bash
PI_BG_RUN_HOST_ENTRY="$(readlink -f "$(command -v pi)")" node --import ./dot_pi/agent/extensions/pi-bg-run/test/host-peers.mjs --test ./dot_pi/agent/extensions/pi-bg-run/test/*.test.ts
```

Opt-in integration test, run from a local Orca-managed workspace. It creates and closes its own test terminals, never your existing ones:

```bash
PI_BG_RUN_ORCA_SMOKE=1 ORCA_CLI_COMMAND=orca-ide node --test ./dot_pi/agent/extensions/pi-bg-run/test/orca.integration.test.ts
```

See `UPSTREAM.md` for the source review and local changes. This fork does not update automatically.
