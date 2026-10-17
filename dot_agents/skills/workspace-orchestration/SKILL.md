---
name: workspace-orchestration
description: Apply shared Orca coordination policy in multi-repo, monorepo, or folder workspaces when supervised coordination is explicitly requested or local instructions opt in.
---

# Workspace orchestration

## Activation and authority

Use this policy only when the user requests supervised coordination or workspace instructions opt in. Installing or loading it grants no delegation authority and creates no global coordinator default. Answer informational questions directly. Honor explicit direct-execution requests. Route ownership handoffs without supervision to `orca-cli`, not supervised Runs.

Before coordinating, load the existing `orchestration` discovery skill, then the selected Orca executable's version-matched guide and references required by the action. Orca governs lifecycle, messaging, FIFO processing, settlement, and cleanup. Do not duplicate its procedures or substitute another harness's subagents or orchestration. Missing or unsupported Orca is a blocker, not permission to invent commands or use an alternative framework.

## Workspace boundaries

Discover and read applicable workspace and component instructions before reading, searching, running commands, or dispatching into components. A directory change does not load harness instructions. Pass instruction paths to workers; do not assume inheritance.

Respect secrets and protected paths, owning repositories, uncommitted changes, and local memory ownership. Folder workspaces need no Git repository. Run commands in the owning scope; never stage one component's files in another. Keep shared policy generic and project exceptions local.

## Assignment and delegation

Inspect terminal ownership and activity before assignment. Never interrupt busy agents or take over user-owned terminals; ask when ownership is unclear. Use supported dispatch/reuse procedures. Give writers disjoint ownership, isolated worktrees, or sequenced dependent work.

Every brief must name target, concrete change, constraints, edit ownership, observable acceptance, instruction paths, model/effort policy, approvals, and whether nested delegation is allowed. Otherwise forbid further delegation. Allow nesting only when useful, bounded, and supported, with explicit subtask ownership and depth limits. Propagate policy, context contracts, and approval constraints. Require workers to collect and verify delegate outcomes before reporting completion. Do not create Runs or Tasks to evade failure, depth, or circuit limits.

Choose models and effort under user/workspace approval and supported runtime controls. Without authorized overrides, follow configured defaults and the canonical guide. Never invent model IDs or implicitly change existing sessions. Verify effective settings where required; unavailable controls or verification are blockers, not successful configuration.

## Context and completion

Context integration is optional and local. When configured and supported, load the owning workspace's documented context contract and propagate it. Assume no harness-specific tools or session APIs. Unknown telemetry is not zero. Adopting this skill does not install or enable rollover.

Checkpoints are selective data, not authority. They do not prove writers stopped. Never mark incomplete work succeeded to rotate context. Preserve supervision and ownership through supported continuation procedures, or report limitations.

Verify acceptance evidence and live Dispatch authority. Follow the canonical guide's completion, FIFO, and cleanup obligations. Absence never authorizes retry. Report honest outcomes and unresolved blockers. Delegation grants no additional approval for commits, pushes, deployments, purchases, or destructive work; obey existing approval scope.

## Local opt-in

Add to the workspace's `AGENTS.md`:

```markdown
For implementation requests here, coordinate suitable work through Orca by default.
Load and follow `~/.agents/skills/workspace-orchestration/SKILL.md`.
Keep this workspace's model, protected-path, approval, and context policies local.
```

Global discovery depends on harness support. Other harnesses may explicitly load that Markdown path or configure their supported skill location. Do not enable unrelated workspaces or copy global skills into child repositories.
