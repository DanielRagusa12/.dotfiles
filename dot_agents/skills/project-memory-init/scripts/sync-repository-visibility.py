"""Sync policy after the agent verifies remote visibility. No network or Git mutations."""

import argparse
from pathlib import Path
import re
import subprocess

START = "<!-- repository-visibility:start -->"
END = "<!-- repository-visibility:end -->"
IGNORE_START = "# project-memory-init: public .pi start"
IGNORE_END = "# project-memory-init: public .pi end"
LEGACY = (
    "Track `AGENTS.md` and the project's `.pi/` folder in this repo, including skills and project memory files. "
    "Commit intentional changes to these files with the related work; do not gitignore them or leave completed memory updates uncommitted. "
    "Review staged content for secrets and exclude credentials, machine-local state, and unrelated changes. "
    "Each child repo owns and commits its own `.pi/` files."
)
REPLACEMENT = "Follow the repository visibility policy below when deciding whether to track `.pi/`. Until that policy is verified, do not commit or push `.pi/` files. Never commit secrets, credentials, machine-local state, or unrelated changes."


def read_file(path):
    if path.is_symlink() or (path.exists() and not path.is_file()):
        raise ValueError(f"refusing non-regular file: {path}")
    return path.read_text() if path.exists() else ""


def replace_block(text, start, end, block):
    if start not in text and end not in text:
        return text + ("\n\n" if text and not text.endswith("\n") else "\n" if text else "") + block
    pattern = re.compile(r"^" + re.escape(start) + r"\n.*?^" + re.escape(end) + r"(?:\n|$)", re.M | re.S)
    matches = list(pattern.finditer(text))
    if text.count(start) != 1 or text.count(end) != 1 or len(matches) != 1:
        raise ValueError(f"malformed markers: {start}")
    match = matches[0]
    return text[:match.start()] + block + text[match.end():]


def policy(visibility):
    common = (
        "- Before every push, recheck the actual destination repository's visibility using the hosting service. "
        "If it differs from this policy or cannot be verified, stop and resolve the policy before pushing. "
        "Unknown visibility is not evidence that a repository is private.\n"
        "- Never commit or push secrets, credentials, or private machine/session state, even to private repositories.\n"
    )
    if visibility == "public":
        rules = (
            "- Keep the root `/.pi/` directory gitignored. Do not force-add or commit its contents.\n"
            "- Before every push to a public repository, review the full outgoing commit range and file contents for `.pi/`, "
            "secrets, personal data, private infrastructure details, and anything else unsuitable for publication. "
            "Check committed files and history, not just the working tree, staged diff, or ignore rules. "
            "If the outgoing range cannot be determined, stop rather than assume it is safe.\n"
            "- If `.pi/` or other private material is already tracked or committed, warn the user and block unsafe pushes. "
            "Ignore rules do not remove tracked files or erase history. Ask before untracking files or rewriting history, "
            "and never delete local `.pi/` contents as a cleanup shortcut.\n"
        )
    else:
        rules = (
            "- The project's `.pi/` skills and memory may be committed with related work after reviewing their contents. "
            "This is permission, not a requirement to force-add ignored files or override local exclusions.\n"
            "- Review outgoing commits before pushing. Private visibility does not make sensitive content safe to commit.\n"
        )
    return f"{START}\n## Repository visibility and push safety\n\nVerified repository visibility: **{visibility}**.\n\n{common}{rules}{END}\n"


def sync(root, visibility):
    agents = root / "AGENTS.md"
    ignore = root / ".gitignore"
    original_agents = read_file(agents)
    original_ignore = read_file(ignore)
    updated_agents = replace_block(original_agents.replace(LEGACY, REPLACEMENT), START, END, policy(visibility))
    ignore_block = f"{IGNORE_START}\n/.pi/\n{IGNORE_END}\n" if visibility == "public" else ""
    updated_ignore = replace_block(original_ignore, IGNORE_START, IGNORE_END, ignore_block) if (visibility == "public" or IGNORE_START in original_ignore or IGNORE_END in original_ignore) else original_ignore
    # Validate both files before writing either. Never change the index or history.
    for path, before, after in ((agents, original_agents, updated_agents), (ignore, original_ignore, updated_ignore)):
        if before != after:
            action = "UPDATED" if path.exists() else "CREATED"
            path.write_text(after)
            print(f"{action} {path.name}")
        else:
            print(f"PRESERVED {path.name}")
    if visibility == "public":
        result = subprocess.run(["git", "-C", str(root), "ls-files", "-z", "--", ".pi"], capture_output=True)
        if result.returncode:
            print("WARNING: could not check tracked .pi files; inspect the repository before any push.")
        elif result.stdout:
            print("WARNING: .pi files are already tracked. Ignore rules do not protect them. Ask before untracking; review outgoing history before pushing.")
    print("Visibility policy synchronized. This does not certify existing commits or history as safe to publish.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    parser.add_argument("visibility", choices=("public", "private"), help="must first be verified against the actual remote host")
    args = parser.parse_args()
    if not args.root.is_absolute() or not args.root.is_dir():
        parser.error("root must be an existing absolute project directory")
    try:
        sync(args.root, args.visibility)
    except (ValueError, OSError) as error:
        parser.exit(1, f"ERROR: {error}\n")


if __name__ == "__main__":
    main()
