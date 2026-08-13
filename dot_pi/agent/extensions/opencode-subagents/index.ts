import * as path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverAgents, effectiveTools, type AgentConfig } from "./agents.ts";
import { runTask, type TaskResult } from "./process.ts";
import { renderTaskCall, renderTaskResult, type TaskDetails } from "./ui.ts";

const Params = Type.Object({
  description: Type.String({ description: "A short description of the delegated task." }),
  prompt: Type.String({ description: "Detailed instructions for the subagent." }),
  subagent_type: Type.String({ description: "Name of an OpenCode agent definition." }),
  task_id: Type.Optional(Type.String({ description: "Existing task ID to resume." })),
  command: Type.Optional(Type.String({ description: "Optional command/context associated with the task." })),
  background: Type.Optional(Type.Boolean({ description: "Run asynchronously; completion is reported to the parent." })),
});
function modelName(model: any): string | undefined { return model ? `${model.provider}/${model.id}` : undefined; }
function text(r: TaskResult) { return `<task id="${r.taskId}" state="${r.state}">\n${r.output}\n</task>`; }

export default function (pi: ExtensionAPI) {
  const jobs = new Map<string, Promise<TaskResult>>();
  pi.registerTool({
    name: "task", label: "Task", description: "Delegate work to an isolated OpenCode-style subagent. Use a named subagent_type, a short description, and detailed prompt.", parameters: Params,
    async execute(_id, params, signal, onUpdate, ctx) {
      const d = discoverAgents(ctx.cwd); const agent = d.agents.find(a => a.name === params.subagent_type);
      const base = (details: TaskDetails, isError = false) => ({ content: [{ type: "text" as const, text: details.result ? text(details.result) : `<task id=\"${details.taskId}\" state=\"${details.state}\">` }], details, isError });
      if (!agent) return { content: [{ type: "text", text: `Unknown subagent "${params.subagent_type}". Available: ${d.agents.map(a => a.name).join(", ") || "none"}` }], details: { agents: d.agents.map(a => a.name), diagnostics: d.diagnostics }, isError: true };
      const depth = Number(process.env.OPENCODE_SUBAGENT_DEPTH || "0"); const maxDepth = Number(process.env.OPENCODE_SUBAGENT_MAX_DEPTH || "1");
      if (depth >= maxDepth) return { content: [{ type: "text", text: `Nested task delegation denied at depth ${depth} (maximum ${maxDepth}).` }], details: {}, isError: true };
      if (agent.source === "project" && ctx.hasUI && !(await ctx.ui.confirm("Run project subagent?", `${agent.name}\n${agent.filePath}\nProject-controlled instructions can execute tools.`))) return { content: [{ type: "text", text: "Project subagent canceled." }], details: {}, isError: true };
      const taskId = params.task_id || crypto.randomUUID(); const details: TaskDetails = { agent: agent.name, source: agent.source, taskId, state: params.background ? "running" : "running", background: params.background };
      const run = runTask({ cwd: ctx.cwd, prompt: `${params.command ? `Command: ${params.command}\n\n` : ""}${params.prompt}`, agent, model: agent.model || modelName(ctx.model), tools: effectiveTools(agent), taskId, signal, onEvent: e => { if (onUpdate && (e as any).type === "tool_execution_start") onUpdate(base(details)); } });
      if (params.background) {
        jobs.set(taskId, run); pi.appendEntry("opencode-subagent-job", { taskId, agent: agent.name, state: "running" });
        void run.then(result => { jobs.delete(taskId); pi.appendEntry("opencode-subagent-job", { taskId, agent: agent.name, state: result.state, output: result.output }); pi.sendMessage({ customType: "opencode-subagent", content: text(result), display: true, details: { taskId, state: result.state } }, { deliverAs: "followUp", triggerTurn: true }); }).catch(() => jobs.delete(taskId));
        return base(details);
      }
      const result = await run; details.state = result.state; details.result = result; if (onUpdate) onUpdate(base(details)); return base(details, result.state !== "completed");
    },
    renderCall(args, theme) { return renderTaskCall(args, theme); },
    renderResult(result, { expanded }, theme) { return renderTaskResult((result.details || {}) as TaskDetails, expanded, theme); },
  });
  pi.on("session_shutdown", () => { /* Child processes are abort-owned by their tool signal; jobs remain resumable. */ });
  pi.registerCommand("tasks", { description: "Show active OpenCode subagent task IDs", handler: async (_args, ctx) => ctx.ui.notify([...jobs.keys()].join("\n") || "No active subagent tasks.", "info") });
}
