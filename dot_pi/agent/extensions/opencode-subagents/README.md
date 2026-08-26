# OpenCode-style subagents for Pi

This global extension registers the OpenCode-compatible `task` tool and runs each task in a persistent child Pi session.

## Agents

The extension always provides two agents: `general` for implementation and multi-step work, and `explore` for read-only investigation.

Additional definitions are Markdown files in `~/.config/opencode/agents/` and the nearest trusted project `.opencode/agents/`. User files override built-ins by name, and project files override user files. The filename without `.md` is the default name. Frontmatter may provide `name`; `description` is required. Supported fields include `mode` (`subagent`, `all`, or `primary`), `model`, `steps`, `hidden`, `disable`, `permission`/`permissions`, and a body. A body containing `{file:path}` loads that file relative to the agents directory.

Only visible `subagent`/`all` agents are exposed. Project agents require a parent-side confirmation in interactive Pi. Non-interactive Pi rejects project agents unless the project is trusted.

## Task contract

`task` accepts `description`, `prompt`, `subagent_type`, optional `task_id`, `command`, and experimental `background`. Foreground results use `<task id="..." state="...">`; task sessions are retained below `~/.pi/agent/opencode-subagents/` so a later `task_id` resumes them. Background jobs return immediately and send a durable completion message when finished.

Child tools default to Pi's coding tools and inherit active `webfetch` and `websearch` tools from the parent. `task`, todo tools, and recursive delegation are denied. The built-in `explore` agent also denies `bash`, `edit`, and `write`. Because child sessions cannot display OpenCode permission prompts, `ask` rules are treated as denials. An agent can explicitly allow `task` in permission rules, but recursion is still bounded by `OPENCODE_SUBAGENT_MAX_DEPTH` (default `1`). Each child receives an incremented `OPENCODE_SUBAGENT_DEPTH`.

When the parent is in Plannotator planning mode, child sessions disable `bash` and load an additional guard. The guard permits `write` and `edit` only for Markdown or MDX files inside the working directory. This lets background research agents save cited notes without allowing them to change source or configuration files.

## Security and compatibility

Project agent Markdown is executable instruction and can authorize child tool calls; review it before approving. Output is capped at 50 KiB in the model-facing result. Child processes are isolated by process and session, not by a sandbox. Provider-native OpenCode behavior, primary-agent switching, and server session navigation are intentionally outside this Pi extension.

The extension is auto-discovered at `~/.pi/agent/extensions/opencode-subagents/index.ts`; `/reload` activates changes.
