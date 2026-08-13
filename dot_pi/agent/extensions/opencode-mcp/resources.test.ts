import { describe, expect, test } from "bun:test";
import { convertResource, decodeResourceRef, encodeResourceRef } from "./resources.ts";
describe("MCP resources", () => {
 test("converts text and images", async () => { const got = await convertResource("s", "u", { contents: [{ uri: "u", text: "hello", mimeType: "text/plain" }, { uri: "i", blob: "aA==", mimeType: "image/png" }] }); expect(got.content.some((x) => x.type === "image")).toBe(true); expect((got.content[0] as any).text).toContain("hello"); });
 test("omits unsupported and oversized binaries", async () => { const unsupported = await convertResource("s", "u", { contents: { blob: "aA==", mimeType: "application/zip" } }); expect((unsupported.content[0] as any).text).toContain("omitted"); const huge = await convertResource("s", "u", { contents: { blob: "a".repeat(14_000_000), mimeType: "image/png" } }); expect((huge.content[0] as any).text).toContain("exceeds"); });
 test("round trips resource refs", () => { const value = encodeResourceRef("a:b", "file:///x y"); expect(decodeResourceRef(value)).toEqual({ server: "a:b", uri: "file:///x y" }); });
});
