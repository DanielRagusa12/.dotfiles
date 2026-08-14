# Language and program adaptation

Use repository precedent first. These are prompts for investigation, not blanket rules.

## JavaScript and TypeScript

Check package scripts, tsconfig, module format, framework conventions, and generated declarations. Look for wrapper hooks/components, duplicate schemas, unnecessary `any`/casts, promise chains that hide errors, redundant state/effects, and config accepted but unused. Verify whether exports are consumed dynamically and whether build tooling generates files.

## Python

Check `pyproject.toml`/`setup.cfg`, package layout, supported Python versions, typing and test conventions. Look for needless classes/factories, duplicate validation, broad exception catches, mutable defaults, import-time side effects, sync/async mismatches, and wrappers that obscure standard-library or framework behavior. Confirm optional plugin/import paths before removing code.

## Go

Check module/package boundaries, exported identifiers, `go.mod`, error and context conventions, and `go test`/lint setup. Investigate repetitive error plumbing, needless interfaces, ignored errors, context misuse, goroutine/lifecycle risks, and unnecessary conversions. Do not remove exported symbols or alter error identity without checking consumers and `errors.Is`/`errors.As` behavior.

## Rust

Check workspace/crate structure, feature flags, edition, clippy/rustfmt configuration, and ownership boundaries. Look for needless clones/allocations, redundant matches/options, over-generic traits, wrapper types with no invariant, and duplicated error conversions. Preserve lifetimes, `Send`/`Sync`, feature behavior, and public semver contracts.

## Java, Kotlin, and C#

Check build files, module boundaries, nullability, dependency-injection and framework lifecycle conventions. Investigate boilerplate adapters, speculative interfaces, duplicate DTO mapping/validation, broad catches, redundant null checks, and configuration objects with one consumer. Account for reflection, annotations, serialization, and external/public API consumers.

## Ruby, PHP, and other dynamic languages

Check runtime/version constraints, autoloading, framework conventions, and test tooling. Treat “unused” cautiously because reflection, conventions, routes, templates, and callbacks may be implicit. Look for duplicate query/serialization logic, unnecessary service layers, broad rescue/catch blocks, and configuration that is not read.

## Shell and automation

Check shell dialect, portability targets, CI runner assumptions, and existing safety flags. Investigate duplicated command sequences, needless subshells/pipelines, ignored exit statuses, unquoted expansions, repeated environment setup, and wrappers that hide failure. Preserve intentional best-effort behavior and do not execute mutating commands during the audit.

## Infrastructure and configuration

For Docker, CI, Terraform, YAML, JSON, and similar declarative programs, identify the authoritative source, interpolation/merge semantics, generated output, and deployment lifecycle. Look for duplicate defaults, dead variables, copied jobs/resources, ineffective settings, and unnecessary layers. Avoid hand-editing generated or environment-specific artifacts; call out required regeneration or rollout validation.

## Program type

- **Library:** prioritize public API stability, consumer compatibility, semver, and reusable primitives.
- **CLI:** trace command registration, exit codes, streams, config precedence, and help output.
- **Service/web app:** trace request boundaries, auth, persistence, retries, observability, and integration contracts.
- **Desktop/mobile app:** trace lifecycle, state ownership, rendering boundaries, and platform conventions.
- **Data/ML pipeline:** trace schemas, reproducibility, idempotence, resource use, and artifact generation.
- **Monorepo/build tooling:** trace package boundaries, dependency direction, generated manifests, and cache semantics.

Adapt findings to the actual category and explicitly record unknowns rather than guessing.
