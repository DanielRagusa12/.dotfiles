import { afterEach, describe, expect, test } from "bun:test";
import {
  EXA_URL,
  NO_RESULTS,
  PARALLEL_URL,
  parseMcpResponse,
  searchWeb,
  selectWebSearchProvider,
  webSearchProviderLabel,
} from "./websearch.ts";

const originalFetch = globalThis.fetch;
const originalProvider = process.env.OPENCODE_WEBSEARCH_PROVIDER;
const originalExaKey = process.env.EXA_API_KEY;
const originalParallelKey = process.env.PARALLEL_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalProvider === undefined) delete process.env.OPENCODE_WEBSEARCH_PROVIDER;
  else process.env.OPENCODE_WEBSEARCH_PROVIDER = originalProvider;
  if (originalExaKey === undefined) delete process.env.EXA_API_KEY;
  else process.env.EXA_API_KEY = originalExaKey;
  if (originalParallelKey === undefined) delete process.env.PARALLEL_API_KEY;
  else process.env.PARALLEL_API_KEY = originalParallelKey;
});

function payload(text: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } });
}

describe("websearch", () => {
  test("selects a stable provider and honors override", () => {
    const session = "ses_0196aabbccddeeff001122334455";
    expect(selectWebSearchProvider(session)).toBe(selectWebSearchProvider(session));
    process.env.OPENCODE_WEBSEARCH_PROVIDER = "parallel";
    expect(selectWebSearchProvider(session)).toBe("parallel");
    process.env.OPENCODE_WEBSEARCH_PROVIDER = "exa";
    expect(selectWebSearchProvider(session)).toBe("exa");
    expect(webSearchProviderLabel("exa")).toBe("Exa Web Search");
  });

  test("parses plain JSON-RPC and SSE responses", () => {
    expect(parseMcpResponse(payload("results"))).toBe("results");
    expect(parseMcpResponse(`data: [DONE]\nevent: message\ndata: ${payload("results")}\n\n`)).toBe("results");
  });

  test("calls Exa with OpenCode's defaults and optional key", async () => {
    process.env.OPENCODE_WEBSEARCH_PROVIDER = "exa";
    process.env.EXA_API_KEY = "exa secret";
    let request: { url: string; body: any } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), body: JSON.parse(String(init?.body)) };
      return new Response(payload("Exa result https://example.com/a"));
    };

    const result = await searchWeb({ query: "effect typescript" }, { sessionID: "ses_test" });
    expect(request?.url).toBe(`${EXA_URL}?exaApiKey=exa%20secret`);
    expect(request?.body.params).toEqual({
      name: "web_search_exa",
      arguments: { query: "effect typescript", type: "auto", numResults: 8, livecrawl: "fallback" },
    });
    expect(result.details.links).toEqual(["https://example.com/a"]);
    expect(JSON.stringify(result)).not.toContain("exa secret");
  });

  test("calls Parallel with session/model attribution and bearer key", async () => {
    process.env.OPENCODE_WEBSEARCH_PROVIDER = "parallel";
    process.env.PARALLEL_API_KEY = "parallel-secret";
    let request: { url: string; headers: Headers; body: any } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return new Response(payload("parallel results"));
    };

    const result = await searchWeb(
      { query: "effect layers", numResults: 2, type: "deep" },
      { sessionID: "ses_parallel", modelName: "claude-opus-4.7" },
    );
    expect(request?.url).toBe(PARALLEL_URL);
    expect(request?.headers.get("authorization")).toBe("Bearer parallel-secret");
    expect(request?.headers.get("user-agent")).toBe("opencode/1.18.18");
    expect(request?.body.params).toEqual({
      name: "web_search",
      arguments: {
        objective: "effect layers",
        search_queries: ["effect layers"],
        session_id: "ses_parallel",
        model_name: "claude-opus-4.7",
      },
    });
    expect(result.details.provider).toBe("parallel");
    expect(JSON.stringify(result)).not.toContain("parallel-secret");
  });

  test("returns the exact no-results fallback", async () => {
    process.env.OPENCODE_WEBSEARCH_PROVIDER = "exa";
    globalThis.fetch = async () => new Response("");
    const result = await searchWeb({ query: "nothing" }, { sessionID: "ses_empty" });
    expect(result.content[0]).toEqual({ type: "text", text: NO_RESULTS });
  });

  test("rejects oversized results and honors cancellation", async () => {
    process.env.OPENCODE_WEBSEARCH_PROVIDER = "exa";
    globalThis.fetch = async () => new Response("x".repeat(300 * 1024));
    await expect(searchWeb({ query: "large" }, { sessionID: "ses_large" })).rejects.toThrow("response exceeded");

    globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
    const controller = new AbortController();
    const pending = searchWeb({ query: "cancel" }, { sessionID: "ses_cancel" }, controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
  });
});
