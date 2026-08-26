import { describe, expect, test } from "bun:test";
import { discoverAgents, effectiveTools, matches } from "./agents.ts";
import { isAllowedPlanningWrite } from "./planning-child-guard.ts";
describe("OpenCode agent permissions", () => {
 test("wildcards and deny wins", () => { expect(matches("read*", "read")).toBe(true); expect(matches("read*", "write")).toBe(false); const a: any = { permissions: [{ action: "allow", pattern: "task" }, { action: "deny", pattern: "bash" }] }; expect(effectiveTools(a)).not.toContain("bash"); expect(effectiveTools(a)).toContain("task"); });
 test("task is denied by default", () => expect(effectiveTools({ permissions: [] } as any)).not.toContain("task"));
 test("built-ins work without OpenCode config", () => {
  const names = discoverAgents("/").agents.map(agent => agent.name);
  expect(names).toContain("general");
  expect(names).toContain("explore");
  const explore = discoverAgents("/").agents.find(agent => agent.name === "explore")!;
  expect(effectiveTools(explore)).not.toContain("bash");
  expect(effectiveTools(explore)).not.toContain("edit");
  expect(effectiveTools(explore)).not.toContain("write");
 });
 test("planning children inherit web tools but not bash", () => {
  const general = discoverAgents("/").agents.find(agent => agent.name === "general")!;
  const tools = effectiveTools(general, ["bash"], ["task", "webfetch", "websearch"]);
  expect(tools).toContain("webfetch");
  expect(tools).toContain("websearch");
  expect(tools).not.toContain("bash");
  expect(tools).not.toContain("task");
 });
 test("planning child writes stay in Markdown files under cwd", () => {
  expect(isAllowedPlanningWrite("notes/research.md", "/repo")).toBe(true);
  expect(isAllowedPlanningWrite("notes/research.mdx", "/repo")).toBe(true);
  expect(isAllowedPlanningWrite("src/index.ts", "/repo")).toBe(false);
  expect(isAllowedPlanningWrite("../outside.md", "/repo")).toBe(false);
 });
});
