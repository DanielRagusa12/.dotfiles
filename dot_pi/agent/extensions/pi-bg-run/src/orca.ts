// Orca terminals are addressed only by runtime-issued handles. Never retry a
// create/split by launching detached: the command may already be running.
import { spawnSync } from "node:child_process";

export type OrcaTask = { handle: string; cli: string };
export type OrcaPort = {
	available(): boolean;
	launch(mode: "tab" | "pane", label: string, cwd: string, line: string): OrcaTask;
	close(target: OrcaTask): void;
	rename(target: OrcaTask, title: string): void;
};

type Runner = typeof spawnSync;

export function orcaCommand(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
	if (env.ORCA_CLI_COMMAND) return env.ORCA_CLI_COMMAND;
	if (env.ORCA_DEV_REPO_ROOT) return "orca-dev";
	// Outside Orca, bare `orca` on Linux is usually the screen reader.
	if (platform === "linux" && !env.ORCA_TERMINAL_HANDLE) return "orca-ide";
	return "orca";
}

export function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function orcaLine(cwd: string, shell: string, script: string, log: string): string {
	return `cd -- ${shellQuote(cwd)} && ${[shell, script, log].map(shellQuote).join(" ")}`;
}

export function createOrcaPort(
	run: Runner = spawnSync,
	env: NodeJS.ProcessEnv = process.env,
	platform = process.platform,
): OrcaPort {
	const cli = orcaCommand(env, platform);
	function call(args: string[], cwd?: string): Record<string, any> {
		const response = run(cli, [...args, "--json"], {
			cwd, encoding: "utf8", windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024,
		});
		if (response.error) throw new Error(`Orca ${args.slice(0, 2).join(" ")}: ${response.error.message}. Do not retry the command automatically.`);
		let body;
		try { body = JSON.parse(String(response.stdout)); } catch {
			throw new Error("Orca returned invalid JSON. Launch outcome may be unknown; inspect terminals before retrying.");
		}
		if (response.status !== 0 || body.ok !== true) {
			throw new Error(`Orca request failed: ${JSON.stringify(body.error ?? body)}. Do not retry the command automatically.`);
		}
		return body.result;
	}
	return {
		available: () => !/^(off|0)$/i.test(env.PI_BG_RUN_ORCA ?? "") && Boolean(env.ORCA_TERMINAL_HANDLE || env.PI_BG_RUN_ORCA === "1"),
		launch(mode, label, cwd, line) {
			if (platform === "win32") throw new Error("Orca background tabs currently require a local POSIX host; use orca: 'none' on Windows.");
			const workspace = call(["worktree", "current"], cwd).worktree;
			if (workspace?.hostId !== "local" || typeof workspace?.id !== "string") {
				throw new Error("Orca background tasks require a local managed workspace; remote hosts are not supported.");
			}
			let args: string[];
			if (mode === "pane") {
				if (!env.ORCA_TERMINAL_HANDLE) throw new Error("Orca pane mode requires ORCA_TERMINAL_HANDLE.");
				const parent = call(["terminal", "show", "--terminal", env.ORCA_TERMINAL_HANDLE], cwd).terminal;
				if (parent?.worktreeId !== workspace.id) throw new Error("The split's parent is not in the requested workspace; use orca: 'tab'.");
				args = ["terminal", "split", "--terminal", env.ORCA_TERMINAL_HANDLE, "--direction", "vertical", "--command", line];
			} else {
				args = ["terminal", "create", "--worktree", `id:${workspace.id}`, "--title", label, "--command", line];
			}
			const result = call(args, cwd);
			const terminal = mode === "pane" ? result.split : result.terminal;
			if (typeof terminal?.handle !== "string") {
				throw new Error("Orca did not return a terminal handle. The command may have started; inspect terminals before retrying.");
			}
			return { handle: terminal.handle, cli };
		},
		close(target) {
			const closed = call(["terminal", "close", "--terminal", target.handle]).close;
			if (closed?.ptyKilled !== true) throw new Error(`Orca could not confirm that ${target.handle} stopped.`);
		},
		rename(target, title) {
			call(["terminal", "rename", "--terminal", target.handle, "--title", title]);
		},
	};
}

export const realOrcaPort = createOrcaPort();
let current = realOrcaPort;
export function orcaPort(): OrcaPort { return current; }
export function setOrcaPort(port: OrcaPort): void { current = port; }
