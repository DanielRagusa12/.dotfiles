import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createOrcaPort, orcaCommand, orcaLine, setOrcaPort, type OrcaPort } from "../src/orca.ts";
import { setProcessPort } from "../src/process.ts";
import { attach, endSession, getRegistry, killTask, pollOnce, startTask } from "../src/registry.ts";

process.env.PI_BG_RUN_STATE = mkdtempSync(join(tmpdir(), "pi-bg-orca-test-"));
process.env.PI_BG_RUN_NO_WATCHER = "1";

test("CLI selection never starts the Linux screen reader outside Orca", () => {
	assert.equal(orcaCommand({}, "linux"), "orca-ide");
	assert.equal(orcaCommand({ ORCA_TERMINAL_HANDLE: "term_parent" }, "linux"), "orca");
	assert.equal(orcaCommand({ ORCA_DEV_REPO_ROOT: "/dev" }, "linux"), "orca-dev");
	assert.equal(orcaCommand({ ORCA_CLI_COMMAND: "/custom/orca" }, "linux"), "/custom/orca");
});

test("tab/split calls use explicit workspace and terminal handles", () => {
	const calls: string[][] = [];
	const port = createOrcaPort(((cli, args) => {
		assert.equal(cli, "/custom/orca");
		calls.push(args);
		let result;
		if (args[0] === "worktree") result = { worktree: { id: "repo::/cwd", hostId: "local" } };
		else if (args[1] === "show") result = { terminal: { worktreeId: "repo::/cwd" } };
		else if (args[1] === "split") result = { split: { handle: "term_split" } };
		else if (args[1] === "close") result = { close: { ptyKilled: true } };
		else result = { terminal: { handle: "term_created" } };
		return { status: 0, stdout: JSON.stringify({ ok: true, result }) };
	}) as any, { ORCA_CLI_COMMAND: "/custom/orca", ORCA_TERMINAL_HANDLE: "term_parent" }, "linux");
	const tab = port.launch("tab", "task's title", "/cwd", "echo safe");
	assert.ok(calls.some((args) => args.includes("id:repo::/cwd") && args.includes("task's title")));
	const split = port.launch("pane", "split", "/cwd", "echo safe");
	assert.equal(split.handle, "term_split");
	assert.ok(calls.some((args) => args[1] === "split" && args.includes("term_parent")));
	port.close(tab);
	assert.ok(calls.some((args) => args[1] === "close" && args.includes("term_created")));
});

test("malformed or ambiguous launch results fail without retry", () => {
	let creates = 0;
	const port = createOrcaPort(((_cli, args) => {
		if (args[0] === "worktree") return { status: 0, stdout: JSON.stringify({ ok: true, result: { worktree: { id: "repo::/cwd", hostId: "local" } } }) };
		creates++;
		return { status: null, error: new Error("ETIMEDOUT"), stdout: "" };
	}) as any, {}, "linux");
	assert.throws(() => port.launch("tab", "test", "/cwd", "echo once"), /Do not retry/);
	assert.equal(creates, 1);
});

test("remote workspaces and unconfirmed closes fail closed", () => {
	const port = createOrcaPort(((_cli, args) => ({ status: 0, stdout: JSON.stringify({ ok: true,
		result: args[0] === "worktree" ? { worktree: { id: "remote::/cwd", hostId: "remote" } } : { close: { ptyKilled: false } },
	}) })) as any, {}, "linux");
	assert.throws(() => port.launch("tab", "test", "/cwd", "echo test"), /local managed workspace/);
	assert.throws(() => port.close({ cli: "orca", handle: "term_owned" }), /could not confirm/);
});

test("command arguments are quoted and cwd is explicit", () => {
	assert.equal(orcaLine("/dir with spaces", "bash", "/it's/script", "/log"),
		"cd -- '/dir with spaces' && 'bash' '/it'\\''s/script' '/log'");
});

let detachedLaunches = 0;
const closed: string[] = [];
const renamed: string[] = [];
let failLaunch = false;
let failClose = false;
let count = 0;
const fake: OrcaPort = {
	available: () => true,
	launch(_mode, _label, _cwd, line) {
		if (failLaunch) throw new Error("ambiguous launch");
		const log = line.match(/'([^']+\.log)'$/)?.[1];
		assert.ok(log);
		writeFileSync(`${log}.pid`, "4242\n");
		return { handle: `term_test_${++count}`, cli: "orca-ide" };
	},
	close(task) {
		if (failClose) throw new Error("close unconfirmed");
		closed.push(task.handle);
	},
	rename(task, title) { renamed.push(`${task.handle}: ${title}`); },
};

function setup() {
	setOrcaPort(fake);
	setProcessPort({ launch: async () => { detachedLaunches++; return 1234; }, killTree: () => assert.fail("must not kill an Orca PID directly"), pidAlive: () => true });
	attach({ sendMessage() {} }, "orca-unit", process.cwd());
}

test("Orca tasks settle, retain failures, and close on kill", async () => {
	setup();
	const ok = await startTask({ command: "true" });
	assert.equal(ok.pid, 4242);
	writeFileSync(ok.logPath, `\n__BG_EXIT__:${ok.nonce}:0\n`);
	pollOnce();
	assert.ok(closed.includes(ok.orca!.handle));
	const bad = await startTask({ command: "false", keepOpen: true });
	writeFileSync(bad.logPath, `\n__BG_EXIT__:${bad.nonce}:1\n`);
	pollOnce();
	assert.ok(renamed.some((line) => line.includes("exited (code 1)")));
	assert.ok(!closed.includes(bad.orca!.handle));
	const killed = await startTask({ command: "sleep 10" });
	killTask(killed, "killed by agent");
	assert.equal(killed.state, "killed");
	assert.ok(closed.includes(killed.orca!.handle));
	assert.equal(detachedLaunches, 0);
	endSession();
});

test("an ambiguous Orca launch never falls back to detached", async () => {
	setup();
	failLaunch = true;
	try { await assert.rejects(startTask({ command: "echo only-once" }), /ambiguous launch/); }
	finally { failLaunch = false; }
	assert.equal(detachedLaunches, 0);
	endSession();
});

test("a close failure never reports the task as killed", async () => {
	setup();
	const task = await startTask({ command: "sleep 10" });
	failClose = true;
	try {
		assert.throws(() => killTask(task, "killed by agent"), /close unconfirmed/);
		assert.equal(task.state, "running");
	} finally { failClose = false; endSession(); getRegistry().tasks.clear(); }
});
