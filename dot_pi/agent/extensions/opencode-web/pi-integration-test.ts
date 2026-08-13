import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import install from "./index.ts";

/** Loaded only by `npm run test:pi`; it is not part of the package manifest. */
export default function (pi: ExtensionAPI) {
  const definitions: any[] = [];
  install({ registerTool(tool: any) { definitions.push(tool); } } as ExtensionAPI);

  pi.on("session_start", (_event, ctx) => {
    const configured = pi.getAllTools();
    const fetchMetadata = configured.find((tool) => tool.name === "webfetch");
    const searchMetadata = configured.find((tool) => tool.name === "websearch");
    const fetchKeys = Object.keys((fetchMetadata?.parameters as any)?.properties ?? {}).sort().join(",");
    const searchKeys = Object.keys((searchMetadata?.parameters as any)?.properties ?? {}).sort().join(",");

    const renderContext = {
      args: {}, state: {}, lastComponent: undefined, invalidate() {}, toolCallId: "test", cwd: ctx.cwd,
      executionStarted: true, argsComplete: true, isPartial: false, expanded: true, showImages: true, isError: false,
    };
    const fetch = definitions.find((tool) => tool.name === "webfetch");
    const search = definitions.find((tool) => tool.name === "websearch");
    const components = [
      fetch?.renderCall({ url: "https://example.com/a/very/long/path", format: "markdown" }, ctx.ui.theme, renderContext),
      search?.renderCall({ query: "a deliberately long web search query for rendering" }, ctx.ui.theme, renderContext),
      search?.renderResult(
        { content: [{ type: "text", text: "result" }], details: { provider: "exa", links: ["https://example.com/a/very/long/path"] } },
        { expanded: true, isPartial: false }, ctx.ui.theme, renderContext,
      ),
    ];

    const ok =
      fetchKeys === "format,timeout,url" &&
      searchKeys === "contextMaxCharacters,livecrawl,numResults,query,type" &&
      !!searchMetadata?.description.includes(String(new Date().getFullYear())) &&
      components.every((component) => component?.render(20).every((line: string) => visibleWidth(line) <= 20));
    console.error(ok ? "OPENCODE_WEB_INTEGRATION_OK" : "OPENCODE_WEB_INTEGRATION_FAILED");
  });
}
