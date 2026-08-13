import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Parser } from "htmlparser2";
import TurndownService from "turndown";
import {
  collectBoundedBody,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  type TruncationResult,
  withTimeout,
} from "./http.ts";

export const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 30 * 1000;
export const MAX_TIMEOUT_MS = 120 * 1000;

export type WebFetchFormat = "text" | "markdown" | "html";

export interface WebFetchInput {
  url: string;
  format?: WebFetchFormat;
  timeout?: number;
}

export interface WebFetchDetails {
  title: string;
  url: string;
  contentType: string;
  format: WebFetchFormat;
  image?: boolean;
  truncation?: TruncationResult;
  fullOutputPath?: string;
}

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";

export const WEBFETCH_DESCRIPTION = `- Fetches content from a specified URL
- Takes a URL and optional format as input
- Fetches the URL content, converts to requested format (markdown by default)
- Returns the content in the specified format
- Use this tool when you need to retrieve and analyze web content

Usage notes:
  - IMPORTANT: if another tool is present that offers better web fetching capabilities, is more targeted to the task, or has fewer restrictions, prefer using that tool instead of this one.
  - The URL must be a fully-formed valid URL
  - HTTP URLs will be automatically upgraded to HTTPS
  - Format options: "markdown" (default), "text", or "html"
  - This tool is read-only and does not modify any files
  - Results may be summarized if the content is very large`;

export function acceptHeader(format: WebFetchFormat): string {
  switch (format) {
    case "markdown":
      return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1";
    case "text":
      return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1";
    case "html":
      return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1";
  }
}

function requestHeaders(format: WebFetchFormat, userAgent: string): HeadersInit {
  return {
    "User-Agent": userAgent,
    Accept: acceptHeader(format),
    "Accept-Language": "en-US,en;q=0.9",
  };
}

function isCloudflareChallenge(response: Response): boolean {
  return response.status === 403 && response.headers.get("cf-mitigated") === "challenge";
}

function isImageAttachment(mime: string): boolean {
  return mime.startsWith("image/") && mime !== "image/svg+xml" && mime !== "image/vnd.fastbidsheet";
}

async function fetchOk(url: string, format: WebFetchFormat, userAgent: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, {
    method: "GET",
    headers: requestHeaders(format, userAgent),
    redirect: "follow",
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response;
}

export async function fetchWebContent(input: WebFetchInput, signal?: AbortSignal) {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error("URL must be a fully-formed valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("URL must start with http:// or https://");
  }

  const format = input.format ?? "markdown";
  const timeout = Math.min((input.timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000, MAX_TIMEOUT_MS);

  return withTimeout(timeout, signal, async (requestSignal) => {
    let response = await fetch(input.url, {
      method: "GET",
      headers: requestHeaders(format, BROWSER_USER_AGENT),
      redirect: "follow",
      signal: requestSignal,
    });

    if (isCloudflareChallenge(response)) {
      await response.body?.cancel().catch(() => undefined);
      response = await fetchOk(input.url, format, "opencode", requestSignal);
    } else if (!response.ok) {
      const status = response.status;
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`Request failed with status ${status}`);
    }

    const body = await collectBoundedBody(response, MAX_RESPONSE_SIZE, "Response too large (exceeds 5MB limit)");
    const contentType = response.headers.get("content-type") ?? "";
    const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    const title = `${input.url} (${contentType})`;
    const details: WebFetchDetails = { title, url: input.url, contentType, format };

    if (isImageAttachment(mime)) {
      return {
        content: [
          { type: "text" as const, text: "Image fetched successfully" },
          { type: "image" as const, data: Buffer.from(body).toString("base64"), mimeType: mime },
        ],
        details: { ...details, image: true },
      };
    }

    const raw = new TextDecoder().decode(body);
    let output = raw;
    if (contentType.includes("text/html")) {
      if (format === "markdown") output = convertHTMLToMarkdown(raw);
      if (format === "text") output = extractTextFromHTML(raw);
    }

    const truncation = truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
    let modelOutput = truncation.content;
    if (truncation.truncated) {
      const directory = await mkdtemp(join(tmpdir(), "pi-webfetch-"));
      const fullOutputPath = join(directory, "output.txt");
      await writeFile(fullOutputPath, output, "utf8");
      details.truncation = truncation;
      details.fullOutputPath = fullOutputPath;
      modelOutput += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${fullOutputPath}]`;
    }

    return { content: [{ type: "text" as const, text: modelOutput }], details };
  }, "Request timed out");
}

export function extractTextFromHTML(html: string): string {
  let text = "";
  let skipDepth = 0;
  const parser = new Parser({
    onopentag(name) {
      if (skipDepth > 0 || ["script", "style", "noscript", "iframe", "object", "embed"].includes(name)) {
        skipDepth++;
      }
    },
    ontext(input) {
      if (skipDepth === 0) text += input;
    },
    onclosetag() {
      if (skipDepth > 0) skipDepth--;
    },
  });
  parser.write(html);
  parser.end();
  return text.trim();
}

export function convertHTMLToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  });
  turndown.remove(["script", "style", "meta", "link"]);
  return turndown.turndown(html);
}
