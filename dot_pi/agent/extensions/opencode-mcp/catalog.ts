// Adapted from anomalyco/opencode v1.18.18 (MIT); see NOTICE.md.
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema, ListToolsResultSchema, ToolSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const MAX_LIST_PAGES = 1_000;
const TolerantListToolsResultSchema = ListToolsResultSchema.extend({ tools: ToolSchema.omit({ outputSchema: true }).array() });
export const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");
export const toolName = (server: string, tool: string) => `${sanitize(server)}_${sanitize(tool)}`;
export async function paginate<T, R extends { nextCursor?: string }>(list: (cursor?: string) => Promise<R>, items: (result: R) => T[]): Promise<T[]> { const output: T[] = []; const seen = new Set<string>(); let cursor: string | undefined; for (let n = 0; n < MAX_LIST_PAGES; n++) { const page = await list(cursor); output.push(...items(page)); if (page.nextCursor === undefined) return output; if (seen.has(page.nextCursor)) throw new Error(`MCP list returned duplicate cursor: ${page.nextCursor}`); seen.add(page.nextCursor); cursor = page.nextCursor; } throw new Error(`MCP list exceeded ${MAX_LIST_PAGES} pages`); }
export async function listTools(client: Client, timeout = 30_000): Promise<Tool[]> { return paginate(async (cursor) => { const params = cursor === undefined ? undefined : { cursor }; try { return await client.listTools(params, { timeout }); } catch (error) { if (!(error instanceof Error) || !/can't resolve reference|resolves to more than one schema|outputSchema|schema.*reference|reference.*schema/i.test(error.message)) throw error; return client.request({ method: "tools/list", params }, TolerantListToolsResultSchema, { timeout }); } }, (r) => r.tools as Tool[]); }
export const objectSchema = (schema: Tool["inputSchema"]): any => ({ ...(schema as object), type: "object", properties: schema.properties ?? {}, additionalProperties: false });
export async function callTool(client: Client, name: string, args: Record<string, unknown>, timeout: number | undefined, signal: AbortSignal | undefined, onProgress?: (message: string) => void) { const result = await client.callTool({ name, arguments: args }, CallToolResultSchema, { timeout, signal, resetTimeoutOnProgress: true, onprogress: (p) => onProgress?.(`MCP progress${p.total ? ` ${p.progress}/${p.total}` : ` ${p.progress}`}`) }); if (result.isError) { const message = result.content.flatMap((x) => x.type === "text" ? [x.text] : []).filter((x) => x.trim()).join("\n\n"); throw new Error(message || "MCP tool returned an error"); } return result; }
export type PiContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
export async function convertToolResult(result: Awaited<ReturnType<typeof callTool>>): Promise<{ content: PiContent[]; details: Record<string, unknown> }> {
  const content: PiContent[] = [];
  for (const item of result.content) {
    if (item.type === "text") content.push({ type: "text", text: item.text });
    else if (item.type === "image") content.push({ type: "image", data: item.data, mimeType: item.mimeType });
    else if (item.type === "resource") {
      const r = item.resource;
      if ("text" in r) content.push({ type: "text", text: `Resource: ${r.uri}\n${r.text}` });
      else content.push({ type: "text", text: `[Embedded binary resource omitted: ${r.uri} (${r.mimeType ?? "application/octet-stream"})]` });
    } else {
      const kind = (item as { type?: string }).type ?? "unknown";
      content.push({ type: "text", text: `[Unsupported MCP content omitted: ${kind}]` });
    }
  }
  if (!content.length && result.structuredContent != null) content.push({ type: "text", text: JSON.stringify(result.structuredContent, null, 2) });
  const text = content.filter((x): x is { type: "text"; text: string } => x.type === "text").map((x) => x.text).join("\n\n");
  if (text) { const cut = truncateHead(text, { maxBytes: DEFAULT_MAX_BYTES, maxLines: DEFAULT_MAX_LINES }); if (cut.truncated) { const dir = join(tmpdir(), "pi-mcp-output"); await mkdir(dir, { recursive: true }); const path = join(dir, `${Date.now()}-${crypto.randomUUID()}.txt`); await writeFile(path, text, { mode: 0o600 }); const replacement = `${cut.content}\n\n[Output truncated: ${cut.outputLines} of ${cut.totalLines} lines (${formatSize(cut.outputBytes)} of ${formatSize(cut.totalBytes)}). Full output saved to: ${path}]`; let used = false; for (let i = 0; i < content.length; i++) if (content[i]?.type === "text") { if (!used) { content[i] = { type: "text", text: replacement }; used = true; } else content.splice(i--, 1); } } }
  return { content, details: { structuredContent: result.structuredContent } };
}
export async function listPrompts(client: Client, timeout?: number) { if (!client.getServerCapabilities()?.prompts) return []; return paginate((cursor) => client.listPrompts(cursor ? { cursor } : undefined, { timeout }), (r) => r.prompts); }
export async function listResources(client: Client, timeout?: number) { if (!client.getServerCapabilities()?.resources) return []; return paginate((cursor) => client.listResources(cursor ? { cursor } : undefined, { timeout }), (r) => r.resources); }
export async function listResourceTemplates(client: Client, timeout?: number) { if (!client.getServerCapabilities()?.resources) return []; return paginate((cursor) => client.listResourceTemplates(cursor ? { cursor } : undefined, { timeout }), (r) => r.resourceTemplates); }
