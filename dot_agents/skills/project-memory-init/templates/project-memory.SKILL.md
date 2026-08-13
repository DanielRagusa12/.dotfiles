---
name: project-memory
description: Read and maintain verified, durable, non-obvious project knowledge. Use when prior project findings could help or a costly-to-rediscover finding should be retained.
---

# Project Memory

`MEMORY.md` beside this file is the project's on-demand memory.

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

Never stage or commit memory files.
