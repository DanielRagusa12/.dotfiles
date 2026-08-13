import { describe, expect, test } from "bun:test";
import { objectSchema, paginate, sanitize, toolName } from "./catalog.ts";
describe("MCP catalog", () => {
 test("sanitizes names and exposes collisions deterministically", () => { expect(sanitize("a.b/c")).toBe("a_b_c"); expect(toolName("a.b", "x/y")).toBe(toolName("a/b", "x.y")); });
 test("paginates", async () => expect(await paginate(async (cursor) => cursor ? { items: [2], nextCursor: undefined } : { items: [1], nextCursor: "b" }, (x) => x.items)).toEqual([1,2]));
 test("rejects repeated cursor", async () => expect(paginate(async () => ({ items: [], nextCursor: "x" }), (x) => x.items)).rejects.toThrow("duplicate cursor"));
 test("normalizes schemas", () => expect(objectSchema({ type: "string" } as any)).toMatchObject({ type: "object", properties: {}, additionalProperties: false }));
});
