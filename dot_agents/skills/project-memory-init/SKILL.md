---
name: project-memory-init
description: Scaffold concise, persistent project memory and its conservative cleanup skill. Use when a user asks to initialize project memory in a repository or directory.
---

# Initialize Project Memory

Perform this single initialization workflow:

1. Resolve the target root with `git rev-parse --show-toplevel` from the user's intended working directory.
2. If that command fails because the directory is not in a Git work tree, explain that no Git root was found and ask the user to confirm using the current directory as the project root. Do not run the initializer before an explicit affirmative response.
3. Pass the resolved absolute root as the sole argument to `scripts/init-project-memory.sh`, resolving the script relative to this `SKILL.md`. Invoke the script exactly once.
4. Report the script's `CREATED`, `UPDATED`, and `PRESERVED` results. If it reports malformed markers, stop and ask the user to repair `AGENTS.md`; do not guess.
5. Tell the user to run `/reload` so Pi discovers the generated project skills.

The script is additive and idempotent. Never stage or commit any generated file. Do not select a non-Git fallback without confirmation.
