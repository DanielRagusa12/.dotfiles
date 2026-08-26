import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { TaskResult } from "./process.ts";

export interface TaskDetails {
  agent: string;
  source: string;
  taskId: string;
  state: "running" | TaskResult["state"];
  result?: TaskResult;
  background?: boolean;
}

export function renderTaskCall(args: any, theme: any) {
  const description = String(args.description || "task");
  return new Text(
    theme.fg("toolTitle", theme.bold("task ")) +
      theme.fg("accent", String(args.subagent_type || "...")) +
      "\n  " +
      theme.fg("dim", description),
    0,
    0,
  );
}

function fallbackText(result: any): string {
  const part = result?.content?.find((item: any) => item.type === "text");
  return typeof part?.text === "string" ? part.text : "Task returned no output.";
}

function hasTaskDetails(value: unknown): value is TaskDetails {
  if (!value || typeof value !== "object") return false;
  const details = value as Partial<TaskDetails>;
  return (
    typeof details.agent === "string" &&
    typeof details.source === "string" &&
    typeof details.taskId === "string" &&
    typeof details.state === "string"
  );
}

export function renderTaskResult(result: any, expanded: boolean, theme: any) {
  if (!hasTaskDetails(result?.details)) return new Text(fallbackText(result), 0, 0);

  const details = result.details;
  const task = details.result;
  const icon = details.state === "completed"
    ? theme.fg("success", "✓")
    : details.state === "running"
      ? theme.fg("warning", "⏳")
      : theme.fg("error", "✗");

  if (!task || !expanded) {
    return new Text(
      `${icon} ${theme.fg("accent", details.agent)} ${theme.fg("muted", `[${details.state}]`)}` +
        (task ? `\n${theme.fg("toolOutput", task.output.slice(0, 1000))}` : ""),
      0,
      0,
    );
  }

  const container = new Container();
  container.addChild(new Text(`${icon} ${details.agent} (${details.source})`, 0, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Markdown(task.output, 0, 0, getMarkdownTheme()));
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `${task.usage.turns} turns · ${task.usage.input + task.usage.output} tokens · ${task.taskId}`,
      ),
      0,
      0,
    ),
  );
  return container;
}
