# Audit and planning rules

## Evidence threshold

Classify each candidate as:

- **High confidence:** directly demonstrated by references, compiler/linter evidence, or a clear invariant; behavior and scope are well understood.
- **Medium confidence:** strong local evidence, but dynamic use, external consumers, or behavior needs confirmation.
- **Low confidence:** plausible preference or architectural concern without enough evidence; exclude from the ordered plan and list as an open question.

Impact is **high** when correctness, security, public compatibility, or broad maintenance is affected; **medium** for recurring complexity or localized defect risk; **low** for small local simplification. Rank by value, confidence, dependency, and risk—not by visual prominence.

A finding must state what exists, where it exists, how it is used, and why the proposed change preserves or intentionally changes behavior. Avoid claims such as “AI-generated” unless provenance is actually known; call it an AI-slop smell.

## Discovery protocol

- Start with read-only status and repository metadata. Do not disturb existing changes.
- Inspect manifests, lockfiles only for ecosystem clues, build scripts, CI, lint/format/type/test configuration, and project instructions.
- If a project-local project-memory `MEMORY.md` exists, read it for durable context and compare proposed findings against it. If it does not exist, record that memory review was skipped; do not run an initializer or create one. Treat memory as a lead, not authority: verify it against current code.
- Use narrow searches for definitions, references, TODOs, feature flags, duplicate literals, and framework entry points. Read enough surrounding code to understand contracts.
- Run only safe, non-mutating checks when useful (for example a compiler/linter dry-run or tests that do not write tracked files). If a tool can update snapshots, caches, coverage, generated files, or dependencies, do not run it; mark it unavailable.
- Treat public exports, command-line interfaces, serialized formats, database migrations, security/auth code, and compatibility shims as protected. Recommend changes there only with explicit evidence and a compatibility/test strategy.

## Plan synthesis

Each ordered step should include:

1. target files and symbols;
2. the smallest concrete change, including what existing helper/type/configuration should be reused;
3. ordering/dependencies and behavior or API compatibility constraints;
4. focused tests or checks to add/update.

When a finding is a verified, non-obvious, reusable project convention (for example, a recurring slop pattern and the project-specific way to avoid it), propose a separate, clearly labeled follow-up to update the existing memory file as an anti-pattern. Include the concise rule and evidence path, avoid duplicating obvious documentation, and do not propose creating memory when the project has not adopted it. Never make that update during the audit.

Group edits that must be atomic, but keep unrelated cleanups separate. Prefer deletion or reuse over introducing another abstraction. Do not prescribe exact code when the evidence only supports a goal. Make hidden assumptions visible.

## Verification protocol

Capture the repository's existing commands exactly when discovered, including their scope. Plan staged verification: focused unit/integration tests for changed behavior, formatter and lint checks, type/build checks, then the relevant full suite or smoke test. Include fixture/snapshot/golden updates only if the expected workflow permits them.

For each behavior-changing refactor, identify invariants and regression cases. For public/API/config changes, include compatibility checks, migration/rollout concerns, and consumer impact. For security-sensitive paths, require targeted review and tests rather than relying solely on broad suites. State which checks could not be run and why. Never claim verification was performed unless it actually was.

## Final quality gate

Before responding, ensure the plan:

- is one coherent implementation plan, not an unprioritized issue dump;
- has path/line evidence for every included finding;
- separates observation, confidence, impact, and recommendation;
- excludes generated/vendor/cache output and low-confidence style preferences;
- names reuse opportunities and affected files;
- includes existing and unavailable verification commands plus remaining risks;
- contains no secrets, private data, or unnecessary file contents;
- contains no edits, patches, or implementation steps performed by the audit itself;
- states whether project memory was found and, if applicable, separates source cleanup from a proposed durable anti-pattern memory update.
