import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { TaskResult } from "./process.ts";
export interface TaskDetails { agent: string; source: string; taskId: string; state: string; result?: TaskResult; background?: boolean; }
export function renderTaskCall(args: any, theme: any) { const p = String(args.description || "task"); return new Text(theme.fg("toolTitle", theme.bold("task ")) + theme.fg("accent", String(args.subagent_type || "...")) + "\n  " + theme.fg("dim", p), 0, 0); }
export function renderTaskResult(details: TaskDetails, expanded: boolean, theme: any) {
  const r = details.result; const icon = details.state === "completed" ? theme.fg("success", "✓") : details.state === "running" ? theme.fg("warning", "⏳") : theme.fg("error", "✗");
  if (!r || !expanded) return new Text(`${icon} ${theme.fg("accent", details.agent)} ${theme.fg("muted", `[${details.state}]`)}${r ? `\n${theme.fg("toolOutput", r.output.slice(0, 1000))}` : ""}`, 0, 0);
  const c = new Container(); c.addChild(new Text(`${icon} ${details.agent} (${details.source})`, 0, 0)); c.addChild(new Spacer(1)); c.addChild(new Markdown(r.output, 0, 0, undefined as any)); c.addChild(new Text(theme.fg("dim", `${r.usage.turns} turns · ${r.usage.input + r.usage.output} tokens · ${r.taskId}`), 0, 0)); return c;
}
