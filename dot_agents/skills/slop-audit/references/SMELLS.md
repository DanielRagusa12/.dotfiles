# Smell catalog

Use these signals to generate hypotheses. A signal becomes a finding only when repository evidence shows unnecessary complexity, duplication, maintenance cost, or a likely behavior risk. Familiarity, personal taste, comments, and line count alone are not evidence.

## Abstraction and structure

- **Speculative abstraction:** interfaces, factories, strategies, registries, or generic utilities with one implementation and no demonstrated seam.
- **Pass-through layers:** wrappers that only forward arguments, rename nothing meaningful, add no policy, and obscure the real call.
- **Premature generalization:** options, type parameters, callbacks, or configuration for hypothetical callers rather than current requirements.
- **Over-fragmentation:** tiny private modules/functions that force readers to hop through layers without isolating behavior.
- **Overlong mixed-responsibility code:** a function or module that combines orchestration, validation, transformation, I/O, and presentation where a boundary would improve reasoning.

Confirm with call sites, lifecycle needs, test seams, and public API status before recommending consolidation.

## Duplication and dead code

- Repeated helpers, constants, validation, serialization, error mapping, or near-identical branches that have a stable shared invariant.
- Parallel implementations that drift or differ only because a shared project primitive was overlooked.
- Unreachable branches, unused imports/parameters/fields, abandoned feature flags, obsolete adapters, and exports with no consumers.
- Duplicate configuration defaults or repeated registration that can disagree.

Check dynamic loading, reflection, CLI entry points, plugin contracts, generated references, and external consumers before labeling code unused.

## Redundancy and needless complexity

- Conditions already guaranteed by types, prior validation, control flow, or framework contracts.
- Repeated null/default checks, nested conditionals, boolean expressions, conversions, or collection passes with no semantic value.
- Error handling that catches and rethrows unchanged, logs and discards, or wraps without adding actionable context.
- Async/concurrency, caching, retries, defensive copying, serialization, or configuration layers unsupported by actual requirements.
- Cargo-cult logging/comments that restate syntax, claim behavior the code does not have, or add noisy duplicate events.

Do not remove safety checks merely because they look repetitive: establish the invariant and failure behavior first.

## Naming and idioms

- Inconsistent terminology for the same concept, misleading names, or generic names that hide domain meaning.
- Language/framework patterns replaced by verbose manual plumbing when the project already uses the idiomatic facility.
- Incorrect lifecycle, resource, error, state, or dependency-injection usage relative to the detected ecosystem.
- API shapes that conflict with local conventions without a documented reason.

An unfamiliar idiom is not automatically wrong; cite project precedent or authoritative ecosystem behavior.

## Configuration and generated boundaries

- Excessive knobs, environment variables, feature switches, or config objects with one fixed value and no real consumer.
- Duplicated defaults across config layers or options that are accepted but ignored.
- Generated/vendor/build/migration files: normally exclude and identify the source/template instead. Never propose hand edits to generated output unless regeneration is the explicit workflow.

## Anti-pattern candidates worth remembering

A slop pattern may belong in project memory only when it is verified, non-obvious, and likely to recur in this repository. Examples include a project-specific wrapper layer that repeatedly hides an established primitive, a known duplicate configuration source, or a framework misuse with a documented local replacement. Record the prevention rule—not a broad accusation that code is “AI-generated”—and cite the smallest useful evidence path. Do not add generic language advice, one-off cleanup, speculative findings, secrets, or task status to memory. If project memory is absent, report the candidate in the plan but skip creating memory.

## Evidence checklist

For every candidate, seek: definition, all relevant references, neighboring precedent, tests, history only when useful and read-only, and formatter/linter/type-checker diagnostics when available without mutation. Prefer a smaller number of high-confidence findings over an exhaustive speculative list.
