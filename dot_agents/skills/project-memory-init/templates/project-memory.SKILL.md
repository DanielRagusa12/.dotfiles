---
name: project-memory
description: Read and maintain verified, durable, non-obvious project knowledge. Use when prior findings could help, implementation or evidence changes affect memory, or a task yields a reusable finding.
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

## Knowledge and temporary artifacts

Persistent agent knowledge belongs only in the owning project's `.pi/skills/project-memory/MEMORY.md`. Do not create or maintain competing findings files, notebooks, or agent-docs knowledge stores, regardless of file extension.

Maintain legitimate canonical project documentation and explicitly requested deliverables. Do not relabel an agent notebook as canonical documentation to bypass this rule. Ask when a document's intended role is unclear.

Temporary plans, handoffs, reports, and scratch files are allowed. Default to a private, uniquely named directory in the platform's configured OS temporary storage, and pass exact paths to recipients. Do not leave temporary artifacts as permanent repository knowledge. Host policy controls temporary-file cleanup; it is not guaranteed or tied to task completion. Temporary storage is not a secret store. For handoffs across reboots, machines, or longer-lived sessions, agree on a durable artifact location explicitly, separate from project memory. Inspect existing tool-managed checkpoint/artifact paths before proposing lifecycle changes.

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

Keep entries terse and specific. Cite relevant project-relative paths when they help future verification. Preserve useful existing entries unless current evidence disproves them.

## Maintain memory during the task

- Read relevant memory before relying on it. When implementation changes or newly verified evidence supersede an entry, correct or replace it during the same task. Do not append a contradictory update while leaving the original presented as current.
- If evidence calls a claim into question but no replacement can be verified, explicitly mark that claim as unverified with a brief reason. Do not invent a replacement or leave the claim confidently stated. This annotation is not admission of an unverified hypothesis as a new finding.
- Before finishing, review memory affected by the task and add newly verified, reusable, non-obvious findings that meet the admission criteria above. A trivial task need not produce an entry, and a small change does not require a full-memory audit.
- Normal additions and verified factual corrections do not require separate bloat-cleanup approval. A narrowly scoped correction may remove a proven-invalid claim, but does not authorize unrelated pruning.
- Discretionary removal or condensation for duplication, verbosity, low value, or historical residue requires the owning scope's `project-memory-bloat-check` skill, an exact before/after proposal, and explicit user approval.

