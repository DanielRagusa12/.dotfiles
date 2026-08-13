import { access, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

function latestAssistantText(ctx: ExtensionCommandContext): string | undefined {
  const branch = ctx.sessionManager.getBranch();

  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;

    if (entry.message.stopReason !== "stop") {
      throw new Error(`The latest assistant response is incomplete (${entry.message.stopReason}).`);
    }

    const text = entry.message.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    if (text.trim()) return text;
  }

  return undefined;
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("save-as-md", {
    description: "Save the last assistant response to a Markdown file",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (!input) {
        ctx.ui.notify("Usage: /save-as-md <path.md>", "error");
        return;
      }

      const path = isAbsolute(input) ? input : resolve(ctx.cwd, input);
      if (!path.toLowerCase().endsWith(".md")) {
        ctx.ui.notify("The destination path must end with .md", "error");
        return;
      }

      let text: string | undefined;
      try {
        text = latestAssistantText(ctx);
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return;
      }

      if (!text) {
        ctx.ui.notify("No assistant response with Markdown text was found", "error");
        return;
      }

      try {
        await access(path);
        if (!ctx.hasUI) {
          ctx.ui.notify(`Cannot confirm overwrite in ${ctx.mode} mode`, "error");
          return;
        }

        const overwrite = await ctx.ui.confirm(
          "Overwrite Markdown file?",
          `${path} already exists. Overwrite it?`,
        );
        if (!overwrite) {
          ctx.ui.notify("Save cancelled", "info");
          return;
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") {
          ctx.ui.notify(`Could not inspect ${path}: ${error instanceof Error ? error.message : String(error)}`, "error");
          return;
        }
      }

      try {
        await writeFile(path, text, "utf8");
        ctx.ui.notify(`Saved assistant response to ${path}`, "info");
      } catch (error) {
        ctx.ui.notify(`Could not save ${path}: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    },
  });
}
