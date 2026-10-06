# Local pi-token-speed

Vendored from https://github.com/gsanhueza/pi-token-speed at commit
`b708faf217fb139c51cf8f8df0ca9c4050e489c8`, upstream version 0.11.0.
The upstream MIT license is preserved in `LICENSE.md`.

Pi discovers this directory through `~/.pi/agent/extensions/pi-token-speed/index.ts`.
There is no managed package declaration, Git remote, or dependency installation.
Pi/package updates do not update this copy. Upstream changes must be reviewed
and copied manually.

Run `/tps` to configure the display. Local changes:

- Settings live in `~/.pi/agent/token-speed.json`, under the `tokenSpeed` key,
  not Pi's shared `settings.json`. The directory follows Pi's `getAgentDir()`.
- Only a missing file is treated as empty. Read errors, malformed JSON, and
  non-object JSON abort reads and updates without replacing the file.
- A lock directory covers the entire read-modify-write operation across sessions.
  Writes use a private temporary file, file sync, and atomic rename.
- Locks are not automatically stolen. After a crash, exit all Pi sessions before
  removing an abandoned `token-speed.json.lock` directory. Updates time out
  rather than risk overwriting another session's changes.

Old upstream `settings.json` configuration is not imported automatically.
If migrating an existing installation, copy only its `tokenSpeed` block into
`token-speed.json`. Do not copy credentials or the rest of Pi's settings.

Storage regression tests use Node's built-in test runner and Pi's existing
TypeScript loader, with no dependency installation. From this directory:

```bash
NODE_PATH="$(npm root -g)/@earendil-works/pi-coding-agent/node_modules" \
  node --test tests/settings-storage.test.mjs
```

The vendored files are upstream `index.ts`, `src/`, and `LICENSE.md`, plus this
README and local storage tests. Upstream package/development manifests and
Git metadata are intentionally omitted.
