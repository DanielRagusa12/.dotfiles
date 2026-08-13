import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  fetchWebContent,
  WEBFETCH_DESCRIPTION,
  type WebFetchDetails,
} from "./webfetch.ts";
import {
  searchWeb,
  WEBSEARCH_DESCRIPTION,
  webSearchProviderLabel,
  type WebSearchDetails,
} from "./websearch.ts";

const WebFetchParameters = Type.Object({
  url: Type.String({ description: "The URL to fetch content from" }),
  format: Type.Optional(
    StringEnum(["text", "markdown", "html"] as const, {
      description: "The format to return the content in (text, markdown, or html). Defaults to markdown.",
      default: "markdown",
    }),
  ),
  timeout: Type.Optional(Type.Number({ description: "Optional timeout in seconds (max 120)" })),
});

const WebSearchParameters = Type.Object({
  query: Type.String({ description: "Websearch query" }),
  numResults: Type.Optional(Type.Number({ description: "Number of search results to return (default: 8)" })),
  livecrawl: Type.Optional(
    StringEnum(["fallback", "preferred"] as const, {
      description:
        "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
    }),
  ),
  type: Type.Optional(
    StringEnum(["auto", "fast", "deep"] as const, {
      description: "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
    }),
  ),
  contextMaxCharacters: Type.Optional(
    Type.Number({ description: "Maximum characters for context string optimized for LLMs (default: 10000)" }),
  ),
});

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "webfetch",
    label: "Web Fetch",
    description: WEBFETCH_DESCRIPTION,
    parameters: WebFetchParameters,
    async execute(_toolCallId, params, signal) {
      return fetchWebContent(params, signal);
    },
    renderCall(args, theme, context) {
      const icon = theme.fg("muted", "▣");
      const title = theme.fg("toolTitle", theme.bold("Web Fetch"));
      const subtitle = args.url ? ` ${theme.fg(context.executionStarted ? "muted" : "accent", args.url)}` : "";
      return new Text(`${icon} ${title}${subtitle}`, 0, 0);
    },
    renderResult(result, { isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("muted", "Fetching…"), 0, 0);
      const details = result.details as WebFetchDetails | undefined;
      if (details?.image) return new Text(theme.fg("success", "Image fetched successfully"), 0, 0);
      if (details?.truncation?.truncated) {
        return new Text(
          theme.fg("warning", "Fetched (output truncated)") +
            (details.fullOutputPath ? ` ${theme.fg("dim", details.fullOutputPath)}` : ""),
          0,
          0,
        );
      }
      return new Text(theme.fg("success", "Fetched"), 0, 0);
    },
  });

  pi.registerTool({
    name: "websearch",
    label: "Web Search",
    description: WEBSEARCH_DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString()),
    parameters: WebSearchParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      return searchWeb(
        params,
        {
          sessionID: ctx.sessionManager.getSessionId(),
          modelName: ctx.model?.id,
        },
        signal,
      );
    },
    renderCall(args, theme) {
      const icon = theme.fg("muted", "▣");
      const title = theme.fg("toolTitle", theme.bold("Web Search"));
      const query = args.query ? ` ${theme.fg("muted", args.query)}` : "";
      return new Text(`${icon} ${title}${query}`, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg("muted", "Searching…"), 0, 0);
      const details = result.details as WebSearchDetails | undefined;
      if (!details) return new Text(theme.fg("dim", textContent(result)), 0, 0);

      let output = theme.fg("success", webSearchProviderLabel(details.provider));
      if (details.links.length > 0) output += theme.fg("muted", ` · ${details.links.length} link(s)`);
      if (!expanded) {
        if (details.links.length > 0) output += ` ${theme.fg("dim", `(${keyHint("app.tools.expand", "to show links")})`)}`;
        return new Text(output, 0, 0);
      }

      for (const url of details.links) output += `\n${theme.fg("accent", url)}`;
      if (details.links.length === 0) output += `\n${theme.fg("dim", textContent(result))}`;
      if (details.fullOutputPath) output += `\n${theme.fg("warning", `Full output: ${details.fullOutputPath}`)}`;
      return new Text(output, 0, 0);
    },
  });
}
