import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Message } from "@earendil-works/pi-ai";
import type { AgentConfig } from "./agents.ts";

export interface TaskUsage { input: number; output: number; cost: number; turns: number; }
export interface TaskResult {
  taskId: string;
  state: "completed" | "error" | "cancelled";
  output: string;
  messages: Message[];
  stderr: string;
  exitCode: number;
  usage: TaskUsage;
  model?: string;
}
export interface RunOptions {
  cwd: string;
  prompt: string;
  agent: AgentConfig;
  model?: string;
  tools: string[];
  taskId?: string;
  depth?: number;
  planning?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: unknown) => void;
}

const CAP = 50 * 1024;
const SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function invocation(args: string[]): { command: string; args: string[] } {
  const script = process.argv[1];
  const bunVirtualScript = script?.startsWith("/$bunfs/root/");
  if (script && !bunVirtualScript && fs.existsSync(script)) {
    return { command: process.execPath, args: [script, ...args] };
  }
  const executable = path.basename(process.execPath).toLowerCase();
  return /^(node|bun)(\.exe)?$/.test(executable)
    ? { command: "pi", args }
    : { command: process.execPath, args };
}

function finalOutput(messages: Message[]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const content: any = message.content;
    if (typeof content === "string") return content;
    return content.filter((part: any) => part.type === "text").map((part: any) => part.text).join("\n");
  }
  return "";
}

function appendCapped(current: string, addition: string): string {
  return (current + addition).slice(-CAP);
}

export async function runTask(options: RunOptions): Promise<TaskResult> {
  const taskId = options.taskId || crypto.randomUUID();
  if (!SAFE_TASK_ID.test(taskId)) {
    throw new Error("task_id must be 1-128 characters using only letters, numbers, '.', '_', or '-'");
  }

  const sessionDir = path.join(
    process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"),
    "opencode-subagents",
  );
  await fs.promises.mkdir(sessionDir, { recursive: true });
  const session = path.join(sessionDir, `${taskId}.jsonl`);
  const args = ["--mode", "json", "-p", "--session", session, "--tools", options.tools.join(",")];
  if (options.model) args.push("--model", options.model);
  if (options.planning) {
    args.push("--extension", fileURLToPath(new URL("./planning-child-guard.ts", import.meta.url)));
  }

  let promptDir: string | undefined;
  if (options.agent.prompt.trim()) {
    promptDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-opencode-agent-"));
    const promptPath = path.join(promptDir, "prompt.md");
    await fs.promises.writeFile(promptPath, options.agent.prompt, { mode: 0o600 });
    args.push("--append-system-prompt", promptPath);
  }
  args.push(options.prompt);

  const result: TaskResult = {
    taskId,
    state: "completed",
    output: "",
    messages: [],
    stderr: "",
    exitCode: 0,
    usage: { input: 0, output: 0, cost: 0, turns: 0 },
    model: options.model,
  };
  let aborted = false;
  let assistantError = "";

  try {
    await new Promise<void>((resolve) => {
      const child = invocation(args);
      const processHandle = spawn(child.command, child.args, {
        cwd: options.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          OPENCODE_SUBAGENT_DEPTH: String(options.depth ?? 1),
        },
      });
      let buffer = "";
      let killTimer: NodeJS.Timeout | undefined;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        let event: any;
        try {
          event = JSON.parse(line);
        } catch {
          result.stderr = appendCapped(result.stderr, `Unparseable child output: ${line}\n`);
          return;
        }
        options.onEvent?.(event);
        if (event.type !== "message_end" || !event.message) return;

        result.messages.push(event.message as Message);
        if (event.message.role !== "assistant") return;
        result.usage.turns++;
        const usage = event.message.usage;
        if (usage) {
          result.usage.input += usage.input || 0;
          result.usage.output += usage.output || 0;
          result.usage.cost += usage.cost?.total || 0;
        }
        result.model ||= event.message.model;
        if (event.message.stopReason === "error" || event.message.stopReason === "aborted") {
          assistantError = event.message.errorMessage || `Assistant stopped with ${event.message.stopReason}`;
        }
      };

      processHandle.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) processLine(line);
      });
      processHandle.stderr.on("data", (data) => {
        result.stderr = appendCapped(result.stderr, data.toString());
      });

      const kill = () => {
        if (aborted) return;
        aborted = true;
        const terminate = (signal: NodeJS.Signals) => {
          try {
            if (process.platform === "win32") processHandle.kill(signal);
            else process.kill(-processHandle.pid!, signal);
          } catch {
            // The child may have exited between the signal and this call.
          }
        };
        terminate("SIGTERM");
        killTimer = setTimeout(() => terminate("SIGKILL"), 2000);
        killTimer.unref();
      };
      if (options.signal) {
        if (options.signal.aborted) kill();
        else options.signal.addEventListener("abort", kill, { once: true });
      }

      processHandle.on("error", (error) => {
        if (killTimer) clearTimeout(killTimer);
        if (options.signal) options.signal.removeEventListener("abort", kill);
        result.stderr = appendCapped(result.stderr, error instanceof Error ? error.message : String(error));
        result.exitCode = 1;
        resolve();
      });
      processHandle.on("close", (code) => {
        if (killTimer) clearTimeout(killTimer);
        if (buffer) processLine(buffer);
        result.exitCode = code ?? 1;
        if (options.signal) options.signal.removeEventListener("abort", kill);
        resolve();
      });
    });

    if (aborted) result.state = "cancelled";
    else if (result.exitCode !== 0 || assistantError) result.state = "error";
    result.output = finalOutput(result.messages).slice(0, CAP);
    if (!result.output) result.output = assistantError || result.stderr || `(child exited ${result.exitCode})`;
    return result;
  } finally {
    if (promptDir) await fs.promises.rm(promptDir, { recursive: true, force: true });
  }
}
