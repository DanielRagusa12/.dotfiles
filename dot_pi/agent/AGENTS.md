# Global Pi Instructions

## Package supply-chain warning

Treat package installation, builds, updates, and first execution as potential code execution. Supply-chain attacks can use stolen maintainer accounts, malicious releases of legitimate packages, typosquatting, dependency confusion, poisoned build recipes, and compromised upstream downloads. Popularity, a familiar name, no dependencies, or a clean vulnerability audit does not establish safety.

- Apply this warning to npm, pnpm, Yarn, Bun, pip/uv, Cargo, Go, RubyGems, Homebrew, system repositories, AUR helpers, Git packages, plugins, and agent extensions. It also applies to commands you generate or delegate, CI jobs, containers, and temporary tooling.
- Before adding or updating a package, verify its exact name, registry or repository, owner, version or commit, and resolved download sources. Inspect the proposed manifest/lockfile diff and transitive dependency changes. Investigate unexpected maintainer transfers, repository changes, new scripts, binaries, or unrelated functionality. When current compromise reports matter, check dated advisories and upstream notices rather than relying on memory.
- Inspect installation and build behavior before execution. Look for lifecycle hooks, Python build backends, Cargo build scripts, native builds, downloaded executables, and post-install actions. Check wrapper tools too: an extension installer, package runner, or AUR helper may invoke a package manager and execute hooks even when the top-level command looks harmless.
- For AUR packages, read `PKGBUILD`, `.install` files, patches, and referenced sources as text before running a helper or `makepkg`. Do not source a recipe merely to inspect it. Review top-level shell statements and every build/install function, source URLs, checksums, and changes since the last reviewed revision. A valid checksum alone does not prove that the source is trustworthy. Do not build as root.
- Disable automatic install/build scripts explicitly where supported, using the selected manager's documented options for its installed version. Do not assume npm flags work for pnpm, Yarn, or Bun, or that another ecosystem has an equivalent safe mode. Script blocking does not stop malicious code executed on import, plugin loading, tests, builds, or first use. Avoid package runners that silently download and execute unreviewed code, and avoid piping remote downloads into a shell.
- Watch for obfuscated code, encoded payloads, unexpected network calls, secret or credential reads, environment-variable scraping, shell execution, persistence, and edits outside the package's expected files. Review published artifacts as well as repository source when practical; they can differ. Never execute suspect code to find out whether it is malicious.
- Prefer reviewed immutable versions or full Git commit hashes and locked dependency trees. Record what was reviewed and whether it can update automatically. Branches and tags can move. Re-review updates rather than treating previous approval as permanent trust.
- Keep unreviewed installation/build code away from credentials, SSH agents, cloud tokens, publishing permissions, and sensitive mounts. Use an isolated environment with least privilege when execution is necessary; do not assume a container alone provides this isolation.
- If provenance is unclear, suspicious behavior appears, or required unreviewed scripts cannot be disabled, stop and ask the user before proceeding. Describe the evidence and proposed execution. Do not override integrity checks or security controls to make an install succeed. Audits, signatures, and provenance attestations are useful evidence, not guarantees against a compromised publisher.

## npm supply-chain safety

- Never run bare `npm install`, `npm i`, `npm ci`, or any npm command that permits lifecycle scripts. Every npm dependency installation must explicitly disable lifecycle scripts with `--ignore-scripts`, even when the user-level npm configuration already enables it.
- This requirement applies both to commands Pi executes and to commands Pi writes, suggests, or adds anywhere, including shell scripts, package scripts, Makefiles, Dockerfiles, container builds, CI/CD workflows, documentation, examples, and generated code. Never emit an npm dependency-install command that relies only on ambient npm configuration for script blocking.
- For an existing project with `package-lock.json`, install dependencies only with:

  ```bash
  npm ci --ignore-scripts
  ```

- When adding or changing a dependency, do not use `npm install <package>`. Edit `package.json` deliberately, update only the lockfile without running lifecycle scripts, then perform a clean locked install:

  ```bash
  npm install --package-lock-only --ignore-scripts
  npm ci --ignore-scripts
  ```

- Pin newly added dependency versions exactly unless the user explicitly requests a range.
- Inspect package provenance, lockfile changes, lifecycle scripts, and the dependency tree before treating a new dependency as trusted.
- Run `npm audit` after dependency changes, while recognizing that an audit does not detect every supply-chain compromise.
- If a package requires an install script to function, stop and ask the user for explicit approval before running it. Explain the script and associated risk.
- These rules apply to global, project-local, temporary, and extension dependencies, regardless of whether installation is direct, scripted, automated, or delegated to another agent or tool.
