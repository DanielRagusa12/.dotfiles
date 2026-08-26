import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverAgents, effectiveTools } from "./agents.ts";
import { runTask, type TaskResult } from "./process.ts";
import { renderTaskCall, renderTaskResult, type TaskDetails } from "./ui.ts";

const Params = Type.Object({
  description: Type.String({ description: "A short description of the delegated task." }),
  prompt: Type.String({ description: "Detailed instructions for the subagent." }),
  subagent_type: Type.String({
    description: "Agent name. Built-ins: general for implementation and complex work; explore for read-only investigation.",
  }),
  task_id: Type.Optional(Type.String({ description: "Existing task ID to resume." })),
  command: Type.Optional(Type.String({ description: "Optional command or context associated with the task." })),
  background: Type.Optional(Type.Boolean({ description: "Run asynchronously and report completion to the parent." })),
});

function modelName(model: any): string | undefined {
  return model ? `${model.provider}/${model.id}` : undefined;
}

function taskText(result: TaskResult): string {
  return `<task id="${result.taskId}" state="${result.state}">\n${result.output}\n</task>`;
}

function environmentNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function isPlannotatorPlanning(pi: ExtensionAPI): Promise<boolean> {
  const activeToolFallback = pi.getActiveTools().includes("plannotator_submit_plan");
  const installed = pi.getCommands().some((command) => command.name.startsWith("plannotator-plan-mode"));
  if (!installed && !activeToolFallback) return false;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(activeToolFallback), 250);
    timer.unref();
    pi.events.emit("plannotator:request", {
      requestId: crypto.randomUUID(),
      action: "plan-mode",
      payload: { mode: "status" },
      respond: (response: any) => {
        const phase = response?.status === "handled" ? response.result?.phase : undefined;
        finish(phase === "planning" || (phase === undefined && activeToolFallback));
      },
    });
  });
}

export default function (pi: ExtensionAPI) {
  const jobs = new Map<string, Promise<TaskResult>>();

  pi.registerTool({
    name: "task",
    label: "Task",
    description: "Delegate work to an isolated subagent. Built-ins are general for implementation and explore for read-only investigation. OpenCode Markdown agent definitions can add or override names.",
    parameters: Params,
    async execute(_id, params, signal, onUpdate, ctx) {
      const discovery = discoverAgents(ctx.cwd);
      const agent = discovery.agents.find((candidate) => candidate.name === params.subagent_type);
      if (!agent) {
        const available = discovery.agents.map((candidate) => candidate.name).join(", ") || "none";
        const diagnostics = discovery.diagnostics.length ? ` Diagnostics: ${discovery.diagnostics.join("; ")}` : "";
        throw new Error(`Unknown subagent "${params.subagent_type}". Available: ${available}.${diagnostics}`);
      }

      const depth = environmentNumber("OPENCODE_SUBAGENT_DEPTH", 0);
      const maxDepth = environmentNumber("OPENCODE_SUBAGENT_MAX_DEPTH", 1);
      if (depth >= maxDepth) {
        throw new Error(`Nested task delegation denied at depth ${depth} (maximum ${maxDepth}).`);
      }
      if (agent.source === "project") {
        if (!ctx.hasUI && !ctx.isProjectTrusted()) {
          throw new Error(`Project subagent "${agent.name}" is unavailable because this project is not trusted.`);
        }
        if (
          ctx.hasUI &&
          !(await ctx.ui.confirm(
            "Run project subagent?",
            `${agent.name}\n${agent.filePath}\nProject-controlled instructions can execute tools.`,
          ))
        ) {
          throw new Error("Project subagent canceled.");
        }
      }

      const parentTools = pi.getActiveTools();
      const planning = await isPlannotatorPlanning(pi);
      const taskId = params.task_id || crypto.randomUUID();
      const details: TaskDetails = {
        agent: agent.name,
        source: agent.source,
        taskId,
        state: "running",
        background: params.background,
      };
      const resultFor = (current: TaskDetails) => ({
        content: [{
          type: "text" as const,
          text: current.result
            ? taskText(current.result)
            : `<task id="${current.taskId}" state="${current.state}">`,
        }],
        details: current,
      });
      const run = runTask({
        cwd: ctx.cwd,
        prompt: `${params.command ? `Command: ${params.command}\n\n` : ""}${params.prompt}`,
        agent,
        model: agent.model || modelName(ctx.model),
        tools: effectiveTools(agent, planning ? ["bash"] : [], parentTools),
        taskId,
        depth: depth + 1,
        planning,
        signal,
        onEvent: (event) => {
          if (onUpdate && (event as any).type === "tool_execution_start") onUpdate(resultFor(details));
        },
      });

      if (params.background) {
        jobs.set(taskId, run);
        pi.appendEntry("opencode-subagent-job", { taskId, agent: agent.name, state: "running" });
        void run.then((result) => {
          jobs.delete(taskId);
          pi.appendEntry("opencode-subagent-job", {
            taskId,
            agent: agent.name,
            state: result.state,
            output: result.output,
          });
          pi.sendMessage(
            {
              customType: "opencode-subagent",
              content: taskText(result),
              display: true,
              details: { taskId, state: result.state },
            },
            { deliverAs: "followUp", triggerTurn: true },
          );
        }).catch((error) => {
          jobs.delete(taskId);
          const message = error instanceof Error ? error.message : String(error);
          pi.appendEntry("opencode-subagent-job", { taskId, agent: agent.name, state: "error", output: message });
          pi.sendMessage(
            {
              customType: "opencode-subagent",
              content: `<task id="${taskId}" state="error">\n${message}\n</task>`,
              display: true,
              details: { taskId, state: "error" },
            },
            { deliverAs: "followUp", triggerTurn: true },
          );
        });
        return resultFor(details);
      }

      const result = await run;
      details.state = result.state;
      details.result = result;
      if (onUpdate) onUpdate(resultFor(details));
      return resultFor(details);
    },
    renderCall(args, theme) {
      return renderTaskCall(args, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderTaskResult(result, expanded, theme);
    },
  });

  pi.registerCommand("tasks", {
    description: "Show active OpenCode subagent task IDs",
    handler: async (_args, ctx) => {
      ctx.ui.notify([...jobs.keys()].join("\n") || "No active subagent tasks.", "info");
    },
  });
}
