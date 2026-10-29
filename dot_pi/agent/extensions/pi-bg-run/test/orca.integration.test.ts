// Opt-in: creates and closes only terminals owned by this test in the current
// local Orca workspace. No installs, model calls, or pre-existing tab changes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createOrcaPort, orcaCommand, setOrcaPort } from "../src/orca.ts";
import { realPort, setProcessPort } from "../src/process.ts";
import { attach, endSession, killTask, pollOnce, startTask, type Task } from "../src/registry.ts";
import { readOutput } from "../src/output.ts";

const enabled = process.env.PI_BG_RUN_ORCA_SMOKE === "1";

test("real Orca tabs: completion, retained failure, kill, timeout, split, detached", { skip: !enabled, timeout: 120_000 }, async () => {
	process.env.PI_BG_RUN_STATE = mkdtempSync(join(tmpdir(), "pi-bg-orca-smoke-"));
	const cli = orcaCommand();
	const port = createOrcaPort(spawnSync, { ...process.env, ORCA_CLI_COMMAND: cli }, process.platform);
	setOrcaPort(port);
	setProcessPort(realPort);
	const messages: string[] = [];
	attach({ sendMessage(message) { messages.push(message.content); } }, "orca-smoke", process.cwd());
	const owned: Task[] = [];
	let parent: { handle: string; cli: string } | undefined;
	async function finish(task: Task) {
		const until = Date.now() + 15_000;
		while (task.state === "running" && Date.now() < until) {
			pollOnce();
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		assert.notEqual(task.state, "running");
	}
	try {
		const ok = await startTask({ command: "printf 'ORCA_BG_SMOKE_OK\\n'", label: "pi-bg-run smoke success", orca: "tab" });
		owned.push(ok);
		assert.ok(ok.orca);
		await finish(ok);
		assert.equal(ok.exitCode, 0);
		assert.match(readOutput(ok, {}).text, /ORCA_BG_SMOKE_OK/);
		assert.equal(messages.filter((line) => line.includes(`task ${ok.id} finished`)).length, 1);

		const bad = await startTask({ command: "printf 'EXPECTED_FAILURE\\n'; exit 7", label: "pi-bg-run smoke failure", keepOpen: true });
		owned.push(bad);
		await finish(bad);
		assert.equal(bad.exitCode, 7);
		// This retained tab belongs only to the test.
		port.close(bad.orca!);

		const killed = await startTask({ command: "sleep 30", label: "pi-bg-run smoke kill" });
		owned.push(killed);
		killTask(killed, "killed by agent");
		assert.equal(killed.state, "killed");

		const timed = await startTask({ command: "sleep 30", timeoutSeconds: 1, label: "pi-bg-run smoke timeout" });
		owned.push(timed);
		await finish(timed);
		assert.equal(timed.reason, "timed out");

		const created = spawnSync(cli, ["terminal", "create", "--worktree", `path:${process.cwd()}`, "--title", "pi-bg-run smoke parent", "--command", "printf 'OWNED_SPLIT_PARENT\\n'", "--json"], { encoding: "utf8", timeout: 15_000 });
		assert.equal(created.status, 0);
		parent = { cli, handle: JSON.parse(created.stdout).result.terminal.handle };
		setOrcaPort(createOrcaPort(spawnSync, { ...process.env, ORCA_CLI_COMMAND: cli, ORCA_TERMINAL_HANDLE: parent.handle }));
		const split = await startTask({ command: "printf 'ORCA_SPLIT_OK\\n'", orca: "pane" });
		owned.push(split);
		await finish(split);
		assert.equal(split.exitCode, 0);
		assert.match(readOutput(split, {}).text, /ORCA_SPLIT_OK/);
		port.close(parent);
		parent = undefined;

		const detached = await startTask({ command: "printf 'DETACHED_OK\\n'", orca: "none" });
		owned.push(detached);
		assert.equal(detached.orca, undefined);
		await finish(detached);
		assert.equal(detached.exitCode, 0);
	} finally {
		endSession();
		for (const task of owned) if (task.orca) { try { port.close(task.orca); } catch { /* already closed */ } }
		if (parent) port.close(parent);
	}
});
