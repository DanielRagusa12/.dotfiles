---
name: project-memory-init
description: Scaffold project memory, then verify repository visibility and synchronize its publication policy. Use when a user asks to initialize project memory in a repository or directory.
disable-model-invocation: true
---

# Initialize project memory

Perform this workflow, including the final visibility step on every invocation:

1. Resolve the target root with `git rev-parse --show-toplevel` from the user's intended working directory. Read applicable `AGENTS.md` instructions before working there.
2. If that command fails because the directory is not in a Git work tree, explain that no Git root was found and ask the user to confirm using the current directory as the project root. Do not run the initializer before an explicit affirmative response.
3. Pass the resolved absolute root as the sole argument to `scripts/init-project-memory.sh`, resolving the script relative to this `SKILL.md`. Invoke the initializer exactly once.
4. Report its `CREATED`, `UPDATED`, and `PRESERVED` results. If it reports malformed markers, stop and ask the user to repair `AGENTS.md`; do not guess.
5. Complete the repository visibility check and policy synchronization below. This step is required even if all scaffolding was preserved.
6. Tell the user to run `/reload` so Pi discovers the generated project skills. If visibility remains unresolved, explicitly report initialization as incomplete, not as safely configured for publication.

The scaffold initializer is additive and idempotent. Existing memory skills receive the routing section only if `## Choose the memory scope` is absent. Existing routing sections, memory entries, valid project-memory AGENTS blocks, and cleanup skills are preserved. Rerunning initialization does not synchronize those policies, except for replacing the known legacy unconditional `.pi/` tracking paragraph during the final visibility step. Update other initialized copies only through direct, reviewed edits that preserve local customization. Do not select a non-Git fallback without confirmation.

New projects receive rules that keep persistent agent knowledge only in the owning project's memory, allow temporary artifacts with OS temporary storage as the default, and preserve canonical documentation and requested deliverables. The memory skill requires same-task correction of superseded claims, explicit unverified annotations when evidence is unresolved, and a completion review of affected memory. Normal additions and factual corrections need no separate cleanup approval; discretionary pruning and condensation still require the cleanup skill's exact proposal and explicit approval.

## Final step: repository visibility

### Verify the hosting service

Determine the actual publication destination from Git remote and push configuration, including separate push URLs. Do not expose credential-bearing remote URLs in output. Do not infer visibility from a repository name, SSH versus HTTPS, successful cloning, or an existing AGENTS entry.

Query the hosting service for the exact repository. For GitHub, use `gh repo view OWNER/REPO --json visibility,url`, with the correct host where needed. Use the equivalent authenticated API or CLI for other hosts. Verify that the returned identity matches the destination. For multiple publication destinations, public takes precedence over private, but an unresolved destination still requires clarification. Treat internal visibility as a separate case requiring user guidance, not automatically as private.

If there is no remote, access fails, the host is unsupported, or visibility is ambiguous, ask the user to confirm the destination and its current visibility. Do not guess private or loosen an existing public policy. Until verified through the host or explicitly confirmed by the user, leave the existing visibility block and ignore rules unchanged and report the unresolved step. A confirmed non-Git project also needs the user's intended publication visibility before this step can finish.

### Synchronize the policy

Once public or private visibility is verified, run:

```sh
python3 /absolute/path/to/project-memory-init/scripts/sync-repository-visibility.py /absolute/project/root public
```

Substitute `private` for a verified private repository. Resolve the helper relative to this skill, not the current directory. This helper requires Python 3 and no packages. If unavailable, stop and report the missing prerequisite rather than installing anything automatically.

The helper creates or replaces only the `repository-visibility` managed block in root `AGENTS.md`, preserving unrelated content. It replaces the exact old initializer paragraph that required committing `.pi/` everywhere with a reference to the new policy. It rejects malformed managed markers and symlinked policy files rather than guessing or editing another file through a link.

- Public repositories get a managed `/.pi/` rule in root `.gitignore` and instructions forbidding `.pi/` commits. Before every public push, agents must review all outgoing commits and their contents for `.pi/`, secrets, and other material unsuitable for publication. Ignored files alone do not establish safety.
- Private repositories get permission to commit reviewed `.pi/` skills and memory, never secrets. A transition from public removes only the helper's managed ignore block. Preserve user-authored ignore rules and do not force-add files.
- On reruns, reverify visibility and update the existing managed block and ignore rule to match. Do not append duplicate policies or rely on the previous classification. The policy requires agents to reverify the actual destination before future pushes too.

Review the resulting diff and root `AGENTS.md` for conflicting custom rules, including unconditional `.pi/` tracking instructions that differ from the known legacy paragraph. Resolve such conflicts narrowly with the user rather than silently overwriting project-specific instructions. For public repositories, verify that root `.pi/` contents are actually ignored, using `git check-ignore --no-index` with representative paths. Check for later negations or nested ignore rules; if they defeat the policy, resolve the conflict before declaring completion.

The helper warns about tracked `.pi/` files but does not inspect or sanitize history. For public repositories, separately inspect tracked files and relevant outgoing history without printing private contents. If `.pi/` or other private material is already tracked or committed, flag the exposure and block unsafe pushes. Ask before untracking files or rewriting history, never delete local `.pi/` as a shortcut, and never claim that adding `.gitignore` removed an existing exposure. Do not push as part of initialization.

Report the verified visibility, policy and ignore-rule changes, and any unresolved conflicts or exposure warnings. Do not claim this step is complete if the policy is still contradicted by custom rules or the effective ignore configuration.
