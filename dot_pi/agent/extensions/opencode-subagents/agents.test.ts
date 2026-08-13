import { describe, expect, test } from "bun:test";
import { effectiveTools, matches } from "./agents.ts";
describe("OpenCode agent permissions", () => {
 test("wildcards and deny wins", () => { expect(matches("read*", "read")).toBe(true); expect(matches("read*", "write")).toBe(false); const a: any = { permissions: [{ action: "allow", pattern: "task" }, { action: "deny", pattern: "bash" }] }; expect(effectiveTools(a)).not.toContain("bash"); expect(effectiveTools(a)).toContain("task"); });
 test("task is denied by default", () => expect(effectiveTools({ permissions: [] } as any)).not.toContain("task"));
});
