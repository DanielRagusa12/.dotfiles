import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { AgentConfig } from "./agents.ts";

export interface TaskUsage { input: number; output: number; cost: number; turns: number; }
export interface TaskResult { taskId: string; state: "completed" | "error" | "cancelled"; output: string; messages: Message[]; stderr: string; exitCode: number; usage: TaskUsage; model?: string; }
export interface RunOptions { cwd: string; prompt: string; agent: AgentConfig; model?: string; tools: string[]; taskId?: string; signal?: AbortSignal; onEvent?: (event: unknown) => void; }
const CAP = 50 * 1024;
function invocation(args: string[]) { const script = process.argv[1]; return script && fs.existsSync(script) && !script.includes("/$bunfs/") ? { command: process.execPath, args: [script, ...args] } : { command: "pi", args }; }
function output(messages: Message[]) { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") { const c: any = messages[i].content; return typeof c === "string" ? c : c.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"); } return ""; }
export async function runTask(o: RunOptions): Promise<TaskResult> {
  const taskId = o.taskId || crypto.randomUUID(); const sessionDir = path.join(process.env.PI_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"), "opencode-subagents");
  await fs.promises.mkdir(sessionDir, { recursive: true }); const session = path.join(sessionDir, `${taskId}.jsonl`);
  const args = ["--mode", "json", "-p", "--session", session, "--tools", o.tools.join(",")];
  if (o.model) args.push("--model", o.model);
  let tmp: string | undefined;
  if (o.agent.prompt.trim()) { tmp = path.join(os.tmpdir(), `pi-opencode-agent-${taskId}.md`); await fs.promises.writeFile(tmp, o.agent.prompt, { mode: 0o600 }); args.push("--append-system-prompt", tmp); }
  args.push(o.prompt);
  const result: TaskResult = { taskId, state: "completed", output: "", messages: [], stderr: "", exitCode: 0, usage: { input: 0, output: 0, cost: 0, turns: 0 }, model: o.model };
  let aborted = false;
  try { await new Promise<void>((resolve) => {
    const p = spawn(invocation(args).command, invocation(args).args, { cwd: o.cwd, stdio: ["ignore","pipe","pipe"], detached: true }); let buf = "";
    const line = (s: string) => { if (!s.trim()) return; let e: any; try { e = JSON.parse(s); } catch { return; } o.onEvent?.(e); if (e.type === "message_end" && e.message) { result.messages.push(e.message); const u = e.message.usage; if (e.message.role === "assistant") { result.usage.turns++; if (u) { result.usage.input += u.input || 0; result.usage.output += u.output || 0; result.usage.cost += u.cost?.total || 0; } result.model ||= e.message.model; } } };
    p.stdout.on("data", d => { buf += d; const ls = buf.split("\n"); buf = ls.pop() || ""; ls.forEach(line); }); p.stderr.on("data", d => { result.stderr = (result.stderr + d).slice(-CAP); });
    const kill = () => { if (aborted) return; aborted = true; try { process.kill(-p.pid!, "SIGTERM"); } catch {} setTimeout(() => { try { process.kill(-p.pid!, "SIGKILL"); } catch {} }, 2000); };
    if (o.signal) o.signal.aborted ? kill() : o.signal.addEventListener("abort", kill, { once: true });
    p.on("error", e => { result.stderr += String(e); resolve(); }); p.on("close", code => { if (buf) line(buf); result.exitCode = code ?? 1; resolve(); });
  }); if (aborted) result.state = "cancelled"; else if (result.exitCode !== 0) result.state = "error"; result.output = output(result.messages).slice(0, CAP); if (!result.output) result.output = result.stderr || `(child exited ${result.exitCode})`; return result;
  } finally { if (tmp) await fs.promises.rm(tmp, { force: true }); }
}
