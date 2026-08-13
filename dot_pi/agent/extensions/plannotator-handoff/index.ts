import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import type { Message, Model } from "@earendil-works/pi-ai";
import type { ThinkingLevel, ExtensionAPI, ExtensionContext, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

const APPROVED = "plannotator:plan-approved";
const HANDOFF_COMMAND = "plannotator-handoff";
const HANDOFF_STATE = "plannotator-handoff:pending";
const LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

type ApprovedPlan = { cwd: string; planFilePath: string; planContent: string; feedback?: string };
let pending: ApprovedPlan | undefined;
let processing = false;
let activeCtx: ExtensionContext | undefined;

function isInside(parent: string, child: string): boolean {
  const p = resolve(parent);
  const c = resolve(child);
  return c === p || c.startsWith(`${p}/`);
}

function modelLabel(model: Model<any>): string {
  return `${model.name ?? model.id}  [${model.provider}/${model.id}]`;
}

function choices(ctx: ExtensionContext): Model<any>[] {
  const scoped = ctx.scopedModels.map((item) => item.model);
  const models = scoped.length ? scoped : ctx.modelRegistry.getAvailable();
  const unique = new Map<string, Model<any>>();
  for (const model of models) unique.set(`${model.provider}/${model.id}`, model);
  return [...unique.values()].sort((a, b) => modelLabel(a).localeCompare(modelLabel(b)));
}

function kickoff(artifact: string): string {
  return `Begin implementation immediately. The approved plan and Plannotator reviewer notes were ingested into this fresh session as the hidden handoff context above.

Read and verify the approved plan against the current repository before making changes. Treat the approved plan as the implementation direction, but correct stale assumptions when necessary and explain any deviations. Do not return to planning mode: implement the work, run the listed validation commands, and report the result.

Handoff artifact: ${artifact}`;
}

function artifactText(event: ApprovedPlan): string {
  return `# Approved Implementation Handoff

## Approved Plan

${event.planContent.trim()}

## Plannotator Reviewer Notes

${event.feedback?.trim() || "No additional reviewer notes were provided."}

## Handoff Rules

- This plan was explicitly approved by the user in Plannotator.
- Verify assumptions against the repository before editing.
- Implement rather than merely describe changes.
- Preserve reviewer notes as guidance, not as a replacement for the approved plan.
`;
}

function approvedFeedback(ctx: ExtensionContext): string | undefined {
  const entries = ctx.sessionManager.getBranch() as any[];
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index];
    if (entry?.type !== "message" || entry.message?.role !== "toolResult") continue;
    if (entry.message.toolName !== "plannotator_submit_plan" || !entry.message.details?.approved) continue;
    return typeof entry.message.details.feedback === "string" ? entry.message.details.feedback : undefined;
  }
  return undefined;
}

async function refreshPlan(event: ApprovedPlan): Promise<ApprovedPlan> {
  const planPath = isAbsolute(event.planFilePath) ? event.planFilePath : resolve(event.cwd, event.planFilePath);
  try {
    const planContent = await readFile(planPath, "utf8");
    if (planContent.trim()) return { ...event, planContent };
  } catch {
    // The persisted approved snapshot remains a safe fallback if the file moved.
  }
  return event;
}

async function recoverPending(ctx: ExtensionContext): Promise<ApprovedPlan | undefined> {
  const entries = ctx.sessionManager.getBranch() as any[];
  const states = entries.filter((entry) => entry?.type === "custom" && entry.customType === HANDOFF_STATE);
  const latestState = states.at(-1)?.data;
  if (latestState?.status === "consumed") return undefined;

  let recovered = latestState?.status === "pending" ? latestState.event as Partial<ApprovedPlan> : undefined;
  if (!recovered && states.length === 0) {
    const marker = [...entries].reverse().find(
      (entry) => entry?.type === "custom" && entry.customType === "plannotator-handoff",
    );
    if (typeof marker?.data?.planFilePath === "string") {
      recovered = {
        cwd: ctx.cwd,
        planFilePath: marker.data.planFilePath,
        planContent: "",
        feedback: approvedFeedback(ctx),
      };
    }
  }

  if (!recovered || typeof recovered.cwd !== "string" || typeof recovered.planFilePath !== "string") return undefined;
  const planPath = isAbsolute(recovered.planFilePath) ? recovered.planFilePath : resolve(recovered.cwd, recovered.planFilePath);
  if (!isInside(recovered.cwd, planPath)) return undefined;
  const event: ApprovedPlan = {
    cwd: recovered.cwd,
    planFilePath: recovered.planFilePath,
    planContent: typeof recovered.planContent === "string" ? recovered.planContent : "",
    feedback: typeof recovered.feedback === "string" ? recovered.feedback : undefined,
  };
  const refreshed = await refreshPlan(event);
  return refreshed.planContent.trim() ? refreshed : undefined;
}

async function runHandoff(pi: ExtensionAPI, _args: string, ctx: ExtensionCommandContext): Promise<void> {
  if (processing || !pending) return;
  processing = true;
  let event = pending;
  let handoffDir: string | undefined;
  let markedConsumed = false;
  try {
    await ctx.waitForIdle();
    if (ctx.mode !== "tui") throw new Error("Automatic external handoff requires interactive Pi mode.");
    event = await refreshPlan(event);

    const models = choices(ctx);
    if (!models.length) throw new Error("No models are available for implementation.");
    const modelOptions = models.map(modelLabel);
    const currentKey = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
    const initial = Math.max(0, models.findIndex((m) => `${m.provider}/${m.id}` === currentKey));
    const selectedLabel = await ctx.ui.select("Choose implementation model (final confirmation)", modelOptions);
    if (!selectedLabel) return;
    const selectedModel = models[modelOptions.indexOf(selectedLabel)] ?? models[initial];
    if (!selectedModel) return;

    const selectedLevel = await ctx.ui.select(
      "Choose implementation effort (final confirmation)",
      LEVELS.map((level) => level === ctx.thinkingLevel ? `${level}  (current)` : level),
    );
    if (!selectedLevel) return;
    const level = LEVELS.find((candidate) => selectedLevel.startsWith(candidate)) ?? ctx.thinkingLevel ?? "medium";

    const dir = await mkdtemp(join(tmpdir(), "pi-plannotator-handoff-"));
    handoffDir = dir;
    const artifactPath = join(dir, "approved-plan.md");
    await writeFile(artifactPath, artifactText(event), { mode: 0o600 });
    const parentSession = ctx.sessionManager.getSessionFile();
    const sourcePlan = isAbsolute(event.planFilePath) ? event.planFilePath : resolve(event.cwd, event.planFilePath);

    pi.appendEntry(HANDOFF_STATE, { status: "consumed", planFilePath: event.planFilePath });
    markedConsumed = true;
    const result = await ctx.newSession({
      parentSession,
      setup: async (sessionManager) => {
        sessionManager.appendMessage({
          role: "user",
          content: [{ type: "text", text: artifactText(event) }],
          timestamp: Date.now(),
        } satisfies Message);
        sessionManager.appendModelChange(selectedModel.provider, selectedModel.id);
        sessionManager.appendThinkingLevelChange(level);
        await rm(dir, { recursive: true, force: true });
      },
      withSession: async (replacementCtx) => {
        await replacementCtx.sendUserMessage(kickoff(sourcePlan));
        replacementCtx.ui.notify(`Implementation session started with ${selectedModel.name ?? selectedModel.id} (${level}).`, "info");
      },
    });
    if (result.cancelled) {
      pi.appendEntry(HANDOFF_STATE, { status: "pending", event });
      markedConsumed = false;
      await rm(dir, { recursive: true, force: true });
    } else {
      pending = undefined;
    }
  } catch (error) {
    if (markedConsumed) {
      try { pi.appendEntry(HANDOFF_STATE, { status: "pending", event }); } catch { /* old session may already be replaced */ }
    }
    ctx.ui.notify(`Plannotator handoff failed: ${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    if (handoffDir) await rm(handoffDir, { recursive: true, force: true });
    processing = false;
  }
}

export default function (pi: ExtensionAPI): void {
  pi.on("session_start", async (_event, ctx) => {
    activeCtx = ctx;
    pending = await recoverPending(ctx);
    if (pending) ctx.ui.notify(`Recovered pending Plannotator handoff for ${pending.planFilePath}.`, "info");
  });
  pi.on("session_shutdown", () => { activeCtx = undefined; });

  pi.events.on(APPROVED, (raw) => {
    const event = raw as Partial<ApprovedPlan> | undefined;
    if (!event || typeof event.cwd !== "string" || typeof event.planFilePath !== "string" || typeof event.planContent !== "string") return;
    const planPath = isAbsolute(event.planFilePath) ? event.planFilePath : resolve(event.cwd, event.planFilePath);
    if (!isInside(event.cwd, planPath)) {
      activeCtx?.ui.notify("Plannotator handoff rejected a plan path outside the project.", "error");
      return;
    }
    pending = { cwd: event.cwd, planFilePath: event.planFilePath, planContent: event.planContent, feedback: typeof event.feedback === "string" ? event.feedback : undefined };
    pi.appendEntry(HANDOFF_STATE, { status: "pending", event: pending });
    // sendUserMessage() deliberately bypasses command dispatch. Sending
    // `/${HANDOFF_COMMAND}` here would therefore hand the literal command to
    // the model instead of invoking the registered command. New-session APIs
    // are only available to command handlers, so leave the approved handoff
    // pending and ask the user to invoke the command explicitly.
    activeCtx?.ui.notify(`Plan approved. Run /${HANDOFF_COMMAND} to choose the implementation model and effort, then start a fresh session.`, "info");
  });

  pi.registerCommand(HANDOFF_COMMAND, {
    description: "Start a fresh implementation session from an approved Plannotator plan",
    handler: async (args, ctx) => runHandoff(pi, args, ctx),
  });

  // Add the next action to Plannotator's external-handoff result without
  // modifying the third-party Plannotator package.
  pi.on("tool_result", async (event) => {
    if (event.toolName !== "plannotator_submit_plan") return;
    const text = event.content
      .filter((item): item is { type: "text"; text: string } => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    if (text !== "Plan approved and handed off for external execution.") return;
    return {
      content: [{
        type: "text",
        text: `${text} Run /${HANDOFF_COMMAND} to choose the implementation model and start a fresh implementation session with the approved plan.`,
      }],
    };
  });
}
