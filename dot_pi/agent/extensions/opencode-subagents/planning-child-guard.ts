import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ALLOWED_EXTENSIONS = new Set([".md", ".mdx"]);

export function isAllowedPlanningWrite(inputPath: string, cwd: string): boolean {
  if (!inputPath) return false;
  const root = path.resolve(cwd);
  const target = path.resolve(root, inputPath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
  return ALLOWED_EXTENSIONS.has(path.extname(target).toLowerCase());
}

export default function (pi: ExtensionAPI): void {
  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\nThe parent session is in Plannotator planning mode. You may research and write Markdown or MDX notes inside the working directory. Do not modify source code, configuration, or other non-Markdown files. Bash is unavailable in this child session.`,
  }));

  pi.on("tool_call", (event, ctx) => {
    if (event.toolName === "bash") {
      return {
        block: true,
        reason: "Plannotator: bash is unavailable to subagents while the parent is in planning mode.",
      };
    }
    if (event.toolName !== "write" && event.toolName !== "edit") return;
    const inputPath = typeof event.input.path === "string" ? event.input.path : "";
    if (isAllowedPlanningWrite(inputPath, ctx.cwd)) return;
    return {
      block: true,
      reason: `Plannotator: planning subagents may only write Markdown files inside the working directory. Blocked: ${inputPath || "<missing path>"}`,
    };
  });
}
