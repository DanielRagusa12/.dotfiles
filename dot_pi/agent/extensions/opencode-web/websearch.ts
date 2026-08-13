import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checksum,
  collectBoundedBody,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  extractUrls,
  formatSize,
  truncateHead,
  type TruncationResult,
  withTimeout,
} from "./http.ts";

export const EXA_URL = "https://mcp.exa.ai/mcp";
export const PARALLEL_URL = "https://search.parallel.ai/mcp";
export const NO_RESULTS = "No search results found. Please try a different query.";
export const MAX_MCP_RESPONSE_SIZE = 256 * 1024;
const OPENCODE_VERSION = "1.18.18";

export type WebSearchProvider = "exa" | "parallel";
export type Livecrawl = "fallback" | "preferred";
export type SearchType = "auto" | "fast" | "deep";

export interface WebSearchInput {
  query: string;
  numResults?: number;
  livecrawl?: Livecrawl;
  type?: SearchType;
  contextMaxCharacters?: number;
}

export interface WebSearchDetails {
  title: string;
  query: string;
  provider: WebSearchProvider;
  links: string[];
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

export const WEBSEARCH_DESCRIPTION = `- Search the web using the session's web search provider - performs real-time web searches and can scrape content from specific URLs
- Provides up-to-date information for current events and recent data
- Supports configurable result counts and returns the content from the most relevant websites
- Use this tool for accessing information beyond knowledge cutoff
- Searches are performed automatically within a single API call

Usage notes:
  - Supports live crawling modes when available: 'fallback' (backup if cached unavailable) or 'preferred' (prioritize live crawling)
  - Search types when available: 'auto' (balanced), 'fast' (quick results), 'deep' (comprehensive search)
  - Configurable context length for optimal LLM integration
  - Domain filtering and advanced search options available

The current year is {{year}}. You MUST use this year when searching for recent information or current events
- Example: If the current year is 2026 and the user asks for "latest AI news", search for "AI news 2026", NOT "AI news 2025"`;

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export function selectWebSearchProvider(
  sessionID: string,
  flags = {
    exa:
      truthy(process.env.OPENCODE_EXPERIMENTAL) ||
      truthy(process.env.OPENCODE_ENABLE_EXA) ||
      truthy(process.env.OPENCODE_EXPERIMENTAL_EXA),
    parallel: truthy(process.env.OPENCODE_ENABLE_PARALLEL) || truthy(process.env.OPENCODE_EXPERIMENTAL_PARALLEL),
  },
): WebSearchProvider {
  const override = process.env.OPENCODE_WEBSEARCH_PROVIDER;
  if (override === "exa" || override === "parallel") return override;
  if (flags.parallel) return "parallel";
  if (flags.exa) return "exa";
  return Number.parseInt(checksum(sessionID) ?? "0", 36) % 2 === 0 ? "exa" : "parallel";
}

export function webSearchProviderLabel(provider: unknown): string {
  if (provider === "parallel") return "Parallel Web Search";
  if (provider === "exa") return "Exa Web Search";
  return "Web Search";
}

export function parseMcpResponse(body: string): string | undefined {
  const parsePayload = (payload: string): string | undefined => {
    const trimmed = payload.trim();
    if (!trimmed.startsWith("{")) return undefined;
    const value = JSON.parse(trimmed) as {
      result?: { content?: Array<{ type?: string; text?: string }> };
    };
    return value.result?.content?.find((item) => item.text)?.text;
  };

  const direct = body.trim() ? parsePayload(body.trim()) : undefined;
  if (direct) return direct;
  for (const line of body.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const result = parsePayload(line.substring(6));
    if (result) return result;
  }
  return undefined;
}

function exaUrl(): string {
  return process.env.EXA_API_KEY
    ? `${EXA_URL}?exaApiKey=${encodeURIComponent(process.env.EXA_API_KEY)}`
    : EXA_URL;
}

async function callMcp(
  url: string,
  tool: string,
  args: Record<string, unknown>,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  return withTimeout(25_000, signal, async (requestSignal) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
      signal: requestSignal,
    });
    if (!response.ok) {
      const status = response.status;
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`${tool} request failed with status ${status}`);
    }
    const bytes = await collectBoundedBody(
      response,
      MAX_MCP_RESPONSE_SIZE,
      `${tool} response exceeded ${MAX_MCP_RESPONSE_SIZE} bytes`,
    );
    return parseMcpResponse(new TextDecoder().decode(bytes));
  }, `${tool} request timed out`);
}

export async function searchWeb(
  input: WebSearchInput,
  context: { sessionID: string; modelName?: string },
  signal?: AbortSignal,
) {
  const provider = selectWebSearchProvider(context.sessionID);
  const title = webSearchProviderLabel(provider);
  let result: string | undefined;

  if (provider === "parallel") {
    result = await callMcp(
      PARALLEL_URL,
      "web_search",
      {
        objective: input.query,
        search_queries: [input.query],
        session_id: context.sessionID,
        model_name: context.modelName?.slice(0, 100),
      },
      {
        "User-Agent": `opencode/${OPENCODE_VERSION}`,
        ...(process.env.PARALLEL_API_KEY
          ? { Authorization: `Bearer ${process.env.PARALLEL_API_KEY}` }
          : {}),
      },
      signal,
    );
  } else {
    result = await callMcp(
      exaUrl(),
      "web_search_exa",
      {
        query: input.query,
        type: input.type || "auto",
        numResults: input.numResults || 8,
        livecrawl: input.livecrawl || "fallback",
        contextMaxCharacters: input.contextMaxCharacters,
      },
      {},
      signal,
    );
  }

  const output = result ?? NO_RESULTS;
  const details: WebSearchDetails = {
    title: `${title}: ${input.query}`,
    query: input.query,
    provider,
    links: extractUrls(output),
  };
  const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  let modelOutput = truncation.content;
  if (truncation.truncated) {
    const directory = await mkdtemp(join(tmpdir(), "pi-websearch-"));
    const fullOutputPath = join(directory, "output.txt");
    await writeFile(fullOutputPath, output, "utf8");
    details.truncation = truncation;
    details.fullOutputPath = fullOutputPath;
    modelOutput += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${fullOutputPath}]`;
  }

  return { content: [{ type: "text" as const, text: modelOutput }], details };
}
