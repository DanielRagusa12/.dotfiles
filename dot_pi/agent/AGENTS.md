# Global Pi Instructions

## npm supply-chain safety

- Never run bare `npm install`, `npm i`, or any npm command that permits lifecycle scripts.
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
- These rules apply to global, project-local, temporary, and extension dependencies.
