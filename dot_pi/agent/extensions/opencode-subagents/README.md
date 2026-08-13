# OpenCode-style subagents for Pi

This global extension registers the OpenCode-compatible `task` tool and runs each task in a persistent child Pi session.

## Agents

Definitions are Markdown files in `~/.config/opencode/agents/` and the nearest trusted project `.opencode/agents/`. Project files override global files by name. The filename (without `.md`) is the default name; frontmatter may provide `name`, and `description` is required. Supported fields include `mode` (`subagent`, `all`, or `primary`), `model`, `steps`, `hidden`, `disable`, `permission`/`permissions`, and a body. A body containing `{file:path}` loads that file relative to the agents directory.

Only visible `subagent`/`all` agents are exposed. Project agents require a parent-side confirmation in interactive Pi.

## Task contract

`task` accepts `description`, `prompt`, `subagent_type`, optional `task_id`, `command`, and experimental `background`. Foreground results use `<task id="..." state="...">`; task sessions are retained below `~/.pi/agent/opencode-subagents/` so a later `task_id` resumes them. Background jobs return immediately and send a durable completion message when finished.

Child tools default to Pi's coding tools, with `task`, todo tools, and recursive delegation denied. An agent can explicitly allow `task` in permission rules, but recursion is still bounded by `OPENCODE_SUBAGENT_MAX_DEPTH` (default `1`). `OPENCODE_SUBAGENT_DEPTH` is inherited for wrappers that launch nested Pi processes.

## Security and compatibility

Project agent Markdown is executable instruction and can authorize child tool calls; review it before approving. Output is capped at 50 KiB in the model-facing result. Child processes are isolated by process and session, not by a sandbox. Provider-native OpenCode behavior, primary-agent switching, and server session navigation are intentionally outside this Pi extension.

The extension is auto-discovered at `~/.pi/agent/extensions/opencode-subagents/index.ts`; `/reload` activates changes.
