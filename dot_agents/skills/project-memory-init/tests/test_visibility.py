import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tempfile
import unittest

SKILL = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("visibility", SKILL / "scripts/sync-repository-visibility.py")
visibility = importlib.util.module_from_spec(spec)
spec.loader.exec_module(visibility)


class VisibilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args], check=True, capture_output=True)

    def sync(self, state):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            visibility.sync(self.root, state)
        return output.getvalue()

    def test_public_and_rerun(self):
        agents = self.root / "AGENTS.md"
        agents.write_text("# Local rules\nKeep this.\n")
        self.sync("public")
        before = agents.read_bytes(), (self.root / ".gitignore").read_bytes()
        self.sync("public")
        self.assertEqual(before, (agents.read_bytes(), (self.root / ".gitignore").read_bytes()))
        self.assertEqual(agents.read_text().count(visibility.START), 1)
        self.assertTrue(agents.read_text().startswith("# Local rules\nKeep this.\n"))
        self.git("check-ignore", "--no-index", ".pi/skills/project-memory/MEMORY.md")
        self.assertIn("full outgoing commit range", agents.read_text())

    def test_transitions_preserve_custom_ignore(self):
        ignore = self.root / ".gitignore"
        ignore.write_text("custom/\n/.pi/\n")
        self.sync("public")
        self.sync("private")
        self.assertEqual(ignore.read_text(), "custom/\n/.pi/\n\n")
        self.assertIn("**private**", (self.root / "AGENTS.md").read_text())
        self.assertNotIn(visibility.IGNORE_START, ignore.read_text())
        self.sync("public")
        self.assertEqual(ignore.read_text().count(visibility.IGNORE_START), 1)
        self.assertIn("**public**", (self.root / "AGENTS.md").read_text())

    def test_private_does_not_create_ignore(self):
        self.sync("private")
        self.assertFalse((self.root / ".gitignore").exists())
        self.assertIn("may be committed", (self.root / "AGENTS.md").read_text())

    def test_legacy_tracking_instruction_replaced(self):
        agents = self.root / "AGENTS.md"
        agents.write_text("Custom prefix\n" + visibility.LEGACY + "\nCustom suffix\n")
        self.sync("public")
        self.assertNotIn(visibility.LEGACY, agents.read_text())
        self.assertIn(visibility.REPLACEMENT, agents.read_text())
        self.assertIn("Custom suffix", agents.read_text())

    def test_malformed_markers_make_no_changes(self):
        for name, marker in (("AGENTS.md", visibility.START), (".gitignore", visibility.IGNORE_END)):
            with self.subTest(name=name):
                agents = self.root / "AGENTS.md"
                ignore = self.root / ".gitignore"
                agents.write_text("Unrelated instructions\n")
                ignore.write_text("custom/\n")
                (self.root / name).write_text(marker + "\n")
                before = agents.read_bytes(), ignore.read_bytes()
                with self.assertRaises(ValueError):
                    self.sync("public")
                self.assertEqual(before, (agents.read_bytes(), ignore.read_bytes()))

    def test_duplicate_and_reversed_markers_rejected(self):
        for text in (f"{visibility.START}\n{visibility.START}\n{visibility.END}\n", f"{visibility.END}\n{visibility.START}\n"):
            (self.root / "AGENTS.md").write_text(text)
            with self.assertRaises(ValueError):
                self.sync("private")

    def test_symlink_rejected_without_changing_target(self):
        target = self.root / "other.md"
        target.write_text("Preserve\n")
        (self.root / "AGENTS.md").symlink_to(target)
        with self.assertRaises(ValueError):
            self.sync("public")
        self.assertEqual(target.read_text(), "Preserve\n")
        self.assertFalse((self.root / ".gitignore").exists())

    def test_tracked_files_warn_and_remain_intact(self):
        memory = self.root / ".pi/memory.md"
        memory.parent.mkdir()
        memory.write_text("Test fixture\n")
        self.git("add", ".pi/memory.md")
        before = self.git("ls-files", "--stage").stdout
        self.assertIn("already tracked", self.sync("public"))
        self.assertEqual(before, self.git("ls-files", "--stage").stdout)
        self.assertEqual(memory.read_text(), "Test fixture\n")

    def test_unknown_visibility_rejected_by_cli(self):
        result = subprocess.run(["python3", str(SKILL / "scripts/sync-repository-visibility.py"), str(self.root), "unknown"], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "AGENTS.md").exists())

    def test_scaffold_then_visibility_preserves_memory_on_rerun(self):
        initializer = SKILL / "scripts/executable_init-project-memory.sh"
        if not initializer.exists():
            initializer = SKILL / "scripts/init-project-memory.sh"
        for state in ("public", "private", "public"):
            subprocess.run(["sh", str(initializer), str(self.root)], check=True, capture_output=True)
            memory = self.root / ".pi/skills/project-memory/MEMORY.md"
            if state == "public" and "Fixture finding" not in memory.read_text():
                memory.write_text(memory.read_text() + "\nFixture finding\n")
            self.sync(state)
            self.assertIn("Fixture finding", memory.read_text())
            agents = (self.root / "AGENTS.md").read_text()
            self.assertEqual(agents.count(visibility.START), 1)
            self.assertNotIn("do not gitignore them", agents)


if __name__ == "__main__":
    unittest.main()
