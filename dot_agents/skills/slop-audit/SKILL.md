---
name: slop-audit
description: Audit a repository for evidence-backed AI-generated code smells and produce a prioritized, implementation-ready cleanup plan without modifying files. Use when reviewing code for over-abstraction, duplication, dead code, needless complexity, or non-idiomatic patterns.
---

# Slop Audit

Perform a read-only audit of the repository and return **one implementation plan** for a later agent. Do not implement any recommendation.

## Hard safety boundary

- Inspect only. Never edit, write, delete, rename, stage, commit, reset, format, or generate files.
- Do not run commands that mutate the repository, install dependencies, invoke code generators, or rewrite caches/configuration.
- Do not create a patch or apply fixes, even when a finding is obvious.
- Treat generated, vendored, cached, build-output, migration, and lock files as excluded unless the user explicitly asks for them. Mention important exclusions.
- Do not expose secrets or reproduce credentials while reporting evidence. Avoid broad output of sensitive files.

If the request asks for implementation, explain that this skill ends with the plan and stop after producing it.

## Audit workflow

1. **Establish scope.** Resolve the Git root and inspect status, top-level layout, manifests, build configuration, contributor guidance, and relevant documentation. Preserve and ignore pre-existing worktree changes. Define included and excluded paths.
2. **Check project memory when present.** Look for a project-local `MEMORY.md` used by a project-memory skill (for example under `.pi/skills/project-memory/` or `.agents/skills/project-memory/`). If none exists, skip this step and continue normally; do not initialize project memory. Read an existing memory file as project context, compare candidate findings against it, and note stale, contradicted, or newly durable knowledge. Because this skill is read-only, never update memory itself; include a narrowly scoped follow-up memory update in the plan only when a verified finding is reusable beyond the current cleanup.
3. **Detect the program.** Identify languages, frameworks, package/build systems, application/library/CLI/service type, entry points, public APIs, and test layout from repository evidence. Prefer project conventions over generic advice. Load [LANGUAGE-GUIDANCE.md](references/LANGUAGE-GUIDANCE.md) for adaptation.
4. **Map behavior.** Trace the main execution paths, module boundaries, data flow, error handling, and important tests. Look for existing helpers, types, configuration, and conventions before calling something duplicate or unused.
5. **Investigate smells.** Use targeted searches and focused file reads. Compare analogous implementations and call sites. Use [SMELLS.md](references/SMELLS.md) as a checklist, not as proof that every pattern is bad.
6. **Classify findings.** Record concrete evidence with repository-relative path and line/range, the observed behavior, why it is likely accidental or costly, confidence, impact, and a narrowly scoped remedy. Distinguish fact from inference; do not report stylistic preference alone.
7. **Synthesize one plan.** Order changes by dependency and risk. Combine related findings, identify reuse opportunities, name affected files/symbols, preserve behavior and public contracts, and include tests and verification. Follow [WORKFLOW.md](references/WORKFLOW.md).

## Required output

Use this structure:

```markdown
# Slop Audit Implementation Plan

## Scope and detected conventions
- Root, included/excluded areas, language/framework, program type
- Existing formatter/linter/type-check/test commands (or unavailable checks)

## Executive summary
- Highest-value cleanup themes and overall confidence

## Project memory impact
- Memory file found and consulted, or `none found — skipped`.
- Existing entries affected, stale/contradicted entries, and any verified durable anti-pattern worth recording later.

## Findings
### F1: <short title> — <confidence>/<impact>
- Evidence: `path:line` (and relevant call sites/tests)
- Observation:
- Why this is slop or unnecessary complexity:
- Proposed change:
- Risk/behavioral considerations:

## Ordered implementation plan
1. **<step>** — files/symbols, exact change, reuse opportunity, and rationale.
2. ...

## Verification plan
- Focused tests/checks after each step and full project checks
- Existing commands and unavailable checks
- Remaining risks, manual checks, and rollback considerations

## Explicit exclusions and open questions
- Low-confidence items, protected/generated/vendor areas, and questions needing confirmation
```

Report only findings that meet the evidence threshold. If no actionable slop is found, say so and still provide scope, checks, exclusions, and verification guidance. Never turn the output into a generic style review.
