import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  acceptHeader,
  convertHTMLToMarkdown,
  extractTextFromHTML,
  fetchWebContent,
  MAX_RESPONSE_SIZE,
} from "./webfetch.ts";

const servers: Array<{ stop(closeActiveConnections?: boolean): void }> = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});

function serve(fetch: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ port: 0, fetch });
  servers.push(server);
  return server.url;
}

describe("webfetch", () => {
  test("ports OpenCode HTML conversions", () => {
    const html = "<h1>Hello</h1><script>bad()</script><p>world <strong>wide</strong></p><style>.bad{}</style>";
    expect(extractTextFromHTML(html)).toBe("Helloworld wide");
    expect(convertHTMLToMarkdown(html)).toBe("# Hello\n\nworld **wide**");
  });

  test("uses format-specific Accept headers", () => {
    expect(acceptHeader("text")).toStartWith("text/plain;q=1.0");
    expect(acceptHeader("markdown")).toStartWith("text/markdown;q=1.0");
    expect(acceptHeader("html")).toStartWith("text/html;q=1.0");
  });

  test("fetches text and defaults HTML to markdown", async () => {
    let accept = "";
    const base = serve((request) => {
      accept = request.headers.get("accept") ?? "";
      return new Response("<h1>Hello</h1><p>world</p><script>bad()</script>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });
    const result = await fetchWebContent({ url: new URL("/page", base).toString() });
    expect(result.content[0]).toEqual({ type: "text", text: "# Hello\n\nworld" });
    expect(accept).toStartWith("text/markdown;q=1.0");
  });

  test("returns raster images as Pi image content and keeps SVG textual", async () => {
    const png = serve(() => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "IMAGE/PNG" } }));
    const image = await fetchWebContent({ url: png.toString(), format: "markdown" });
    expect(image.content[0]).toEqual({ type: "text", text: "Image fetched successfully" });
    expect(image.content[1]).toMatchObject({ type: "image", mimeType: "image/png" });

    const svg = serve(() => new Response("<svg><text>hello</text></svg>", { headers: { "content-type": "image/svg+xml" } }));
    const text = await fetchWebContent({ url: svg.toString(), format: "html" });
    expect(text.content[0]?.type === "text" && text.content[0].text).toContain("<svg>");
  });

  test("retries a Cloudflare challenge with the opencode user agent", async () => {
    const agents: string[] = [];
    const base = serve((request) => {
      agents.push(request.headers.get("user-agent") ?? "");
      return agents.length === 1
        ? new Response("challenge", { status: 403, headers: { "cf-mitigated": "challenge" } })
        : new Response("ok", { headers: { "content-type": "text/plain" } });
    });
    const result = await fetchWebContent({ url: base.toString(), format: "text" });
    expect(result.content[0]).toEqual({ type: "text", text: "ok" });
    expect(agents[0]).toContain("Mozilla/5.0");
    expect(agents[1]).toBe("opencode");
  });

  test("rejects schemes and oversized bodies", async () => {
    await expect(fetchWebContent({ url: "file:///etc/passwd" })).rejects.toThrow("http:// or https://");
    const base = serve(() => new Response("x".repeat(MAX_RESPONSE_SIZE + 1)));
    await expect(fetchWebContent({ url: base.toString() })).rejects.toThrow("exceeds 5MB");
  });

  test("truncates model output and saves complete content", async () => {
    const complete = `${"x".repeat(100)}\n`.repeat(2200);
    const base = serve(() => new Response(complete, { headers: { "content-type": "text/plain" } }));
    const result = await fetchWebContent({ url: base.toString(), format: "text" });
    expect(result.details.truncation?.truncated).toBe(true);
    expect(await readFile(result.details.fullOutputPath!, "utf8")).toBe(complete);
    expect(result.content[0]?.type === "text" && result.content[0].text).toContain("Output truncated");
  });

  test("honors timeout and caller cancellation", async () => {
    const base = serve(() => new Promise<Response>(() => {}));
    await expect(fetchWebContent({ url: base.toString(), timeout: 0.005 })).rejects.toThrow("Request timed out");

    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(fetchWebContent({ url: base.toString() }, controller.signal)).rejects.toThrow("cancelled");
  });
});
