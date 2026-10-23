---
name: project-memory-init
description: Scaffold concise, persistent project memory and its conservative cleanup skill. Use when a user asks to initialize project memory in a repository or directory.
disable-model-invocation: true
---

# Initialize Project Memory

Perform this single initialization workflow:

1. Resolve the target root with `git rev-parse --show-toplevel` from the user's intended working directory.
2. If that command fails because the directory is not in a Git work tree, explain that no Git root was found and ask the user to confirm using the current directory as the project root. Do not run the initializer before an explicit affirmative response.
3. Pass the resolved absolute root as the sole argument to `scripts/init-project-memory.sh`, resolving the script relative to this `SKILL.md`. Invoke the script exactly once.
4. Report the script's `CREATED`, `UPDATED`, and `PRESERVED` results. If it reports malformed markers, stop and ask the user to repair `AGENTS.md`; do not guess.
5. Tell the user to run `/reload` so Pi discovers the generated project skills.

The script is additive and idempotent. Existing memory skills receive the routing section only if `## Choose the memory scope` is absent. All existing content is preserved, including project-specific instructions and memory entries. An existing routing section is left unchanged. Existing valid AGENTS blocks and existing cleanup skills are preserved too. Rerunning initialization is not policy synchronization; update initialized copies only through direct, reviewed edits that preserve local customization. Do not select a non-Git fallback without confirmation.

New projects receive rules that keep persistent agent knowledge only in the owning project's memory, allow temporary artifacts with OS temporary storage as the default, and preserve canonical documentation and requested deliverables. The memory skill requires same-task correction of superseded claims, explicit unverified annotations when evidence is unresolved, and a completion review of affected memory. Normal additions and factual corrections need no separate cleanup approval; discretionary pruning and condensation still require the cleanup skill's exact proposal and explicit approval.
