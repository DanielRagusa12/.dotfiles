---
name: project-memory-bloat-check
description: Conservatively audit project memory for stale, duplicate, obvious, or verbose entries. Use when MEMORY.md needs cleanup; changes require explicit user approval.
---

# Project Memory Bloat Check

Audit `.pi/skills/project-memory/MEMORY.md` conservatively. Never stage or commit files.

## 1. Review evidence

Read the entire memory file. Inspect the current code, configuration, and canonical project documentation relevant to each candidate before judging it.

Propose removal only for:

- Duplicate entries.
- Claims contradicted by authoritative current project files.
- Task/session residue, transient failures, logs, or narrative history.
- Facts now readily rediscovered from a directory listing, manifest, nearby code, canonical documentation, or a standard command.

Propose condensation when an entry remains valuable but is unnecessarily verbose. Prefer a short pointer to canonical documentation over duplicated explanation when the pointer remains useful.

Preserve non-obvious invariants, safety constraints, cross-file behavior, environment-specific traps, and expensive-to-rediscover knowledge. If relevance, correctness, or value is uncertain, retain the entry.

## 2. Propose without editing

Before modifying the file, present:

- Every exact passage proposed for removal, with a reason and project-relative evidence paths.
- Every proposed condensation as exact before and after text, with a reason and project-relative evidence paths.

State explicitly that no change has been made, then ask for confirmation to apply exactly that proposal. Do not edit in the same turn as the proposal.

## 3. Require explicit confirmation

Only a clear affirmative response permits the precisely proposed edits. A declined, ambiguous, or absent response leaves `MEMORY.md` byte-for-byte unchanged. If further review discovers any additional cleanup, present a new proposal and obtain new confirmation; do not fold it into an approved set.

After approval, apply only the approved removals and condensations, then summarize them. Do not make incidental formatting changes.
