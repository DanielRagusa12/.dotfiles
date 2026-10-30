<!-- project-memory:start -->
## Project memory

Use `project-memory` when prior findings could help, changes affect memory, or a task yields a reusable finding.

- Persistent agent knowledge belongs only in the owning project's `.pi/skills/project-memory/MEMORY.md`, not competing findings files, notebooks, or agent-docs stores of any format.
- Temporary plans, handoffs, reports, and scratch files are allowed; default to OS temporary storage, not permanent repository knowledge. Maintain canonical documentation and requested deliverables; do not relabel notebooks to bypass this rule. Ask if the role is unclear.
- Read relevant memory before relying on it. Correct or replace superseded entries in the same task; do not leave contradictory claims current. Mark questioned claims unverified with a reason if no replacement can be verified.
- Before finishing, review affected memory and retain newly verified, reusable, non-obvious findings. No forced entry or full audit for every small task.
- Normal additions and verified factual corrections need no separate cleanup approval. Discretionary pruning or condensation requires `project-memory-bloat-check` and explicit approval of exact edits; factual correction does not authorize unrelated pruning.

Follow the repository visibility policy below when deciding whether to track `.pi/`. Until that policy is verified, do not commit or push `.pi/` files. Never commit secrets, credentials, machine-local state, or unrelated changes.
<!-- project-memory:end -->
