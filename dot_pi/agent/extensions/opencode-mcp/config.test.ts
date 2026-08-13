import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfigFile, updateServer } from "./config.ts";
let dirs: string[] = []; afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); dirs = []; });
async function dir() { const d = await mkdtemp(join(tmpdir(), "mcp-config-")); dirs.push(d); return d; }
describe("MCP config", () => {
 test("parses JSONC, infers transport, interpolates, and isolates invalid servers", async () => { const d = await dir(), p = join(d, "mcp.jsonc"); process.env.MCP_TEST_VALUE = "secret-value"; await writeFile(p, `{ // hi\n "servers": { "local": { "command": ["echo", "{env:MCP_TEST_VALUE}"] }, "bad": { "url": "wat" } } }`); const got = await readConfigFile(p); expect(got.servers.local).toEqual({ type: "local", command: ["echo", "secret-value"] }); expect(got.servers.bad).toBeUndefined(); expect(got.diagnostics[0]?.message).not.toContain("secret-value"); });
 test("reports missing variable by name without values", async () => { const d = await dir(), p = join(d, "mcp.jsonc"); delete process.env.SURELY_MISSING_MCP_X; await writeFile(p, `{ "servers": { "x": { "url": "https://x/{env:SURELY_MISSING_MCP_X}" } } }`); const got = await readConfigFile(p); expect(got.diagnostics[0]?.message).toContain("SURELY_MISSING_MCP_X"); });
 test("comment-preserving update", async () => { const d = await dir(), p = join(d, "mcp.jsonc"); await writeFile(p, `{\n // keep me\n "servers": {}\n}\n`); await updateServer(p, "x", { type: "remote", url: "https://example.com/mcp" }); expect(await readFile(p, "utf8")).toContain("// keep me"); expect((await readConfigFile(p)).servers.x?.type).toBe("remote"); });
});
