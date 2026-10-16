---
name: project-memory
description: Read and maintain verified, durable, non-obvious project knowledge. Use when prior project findings could help or a costly-to-rediscover finding should be retained.
---

# Project Memory

Project memory lives at `<project-root>/.pi/skills/project-memory/MEMORY.md` and is read on demand.

## Choose the memory scope

- Choose the project from the files and systems involved in the task, not the session's starting directory or the location of this loaded skill.
- For work inside a child repo, use that repo's memory. Find its root from the relevant file's ancestors; a Git root may contain a `.git` directory or file. Read its `AGENTS.md` and local `project-memory/SKILL.md` before updating memory, if present.
- For workspace infrastructure or findings shared across repos, use the workspace root's memory. Read parent memory only when its findings may affect the task.
- For cross-repo work, consult each relevant memory and store each finding in the narrowest scope that owns it. Keep shared findings in workspace memory rather than duplicating them across repos.
- Resolve evidence paths relative to the root that owns the selected memory.
- Do not put child-repo findings in parent memory merely because child memory is missing. Create it in the owning project's standard location when a finding qualifies. If ownership is unclear, ask before writing.

These rules route memory explicitly; they do not depend on Pi automatically loading child skills or switching skills after a shell `cd`.

## Use memory

- Read `MEMORY.md` when its prior findings may affect the task.
- Treat entries as leads, not authority. Verify relevant claims against current code, configuration, and canonical documentation before relying on them.

## Add or update memory

Record a finding only when all are true:

- It is verified against authoritative project evidence.
- It is reusable beyond the current task or session.
- It is non-obvious or costly to rediscover.

Do not record:

- Facts readily available from a directory listing, manifest, nearby code, canonical project documentation, or a standard command.
- Secrets, credentials, personal data, unverified hypotheses, task status, transient failures, logs, or narrative history.

Keep entries terse and specific. Cite relevant project-relative paths when they help future verification. Update or replace a superseded entry rather than adding a duplicate. Preserve useful existing entries unless current evidence disproves them.

