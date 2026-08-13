import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentSource = "user" | "project";
export type PermissionAction = "allow" | "deny" | "ask";
export interface PermissionRule { action: PermissionAction; pattern: string; }
export interface AgentConfig {
  name: string; description: string; mode: "subagent" | "primary" | "all";
  model?: string; prompt: string; steps?: number; hidden: boolean; disabled: boolean;
  permissions: PermissionRule[]; source: AgentSource; filePath: string;
}
export interface Discovery { agents: AgentConfig[]; projectDir: string | null; diagnostics: string[]; }

function scalar(v: unknown): string | undefined { return typeof v === "string" ? v.trim() : undefined; }
function bool(v: unknown, d = false): boolean { return v === true || v === "true" || (v === undefined && d); }
function rules(value: unknown): PermissionRule[] {
  if (!value) return [];
  if (typeof value === "string") return value.split(",").map(x => parseRule(x.trim())).filter(Boolean) as PermissionRule[];
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([k,v]) => {
    const action = String(v) as PermissionAction; return ["allow","deny","ask"].includes(action) ? [{ action, pattern: k }] : [];
  });
  return [];
}
function parseRule(s: string): PermissionRule | undefined {
  const m = /^(allow|deny|ask)\s*:\s*(.+)$/i.exec(s); return m ? { action: m[1].toLowerCase() as PermissionAction, pattern: m[2] } : undefined;
}
function projectDir(cwd: string): string | null {
  let d = path.resolve(cwd); while (true) { const x = path.join(d, ".opencode", "agents"); if (fs.existsSync(x) && fs.statSync(x).isDirectory()) return x; const p = path.dirname(d); if (p === d) return null; d = p; }
}
function load(dir: string, source: AgentSource, diagnostics: string[]): AgentConfig[] {
  if (!dir || !fs.existsSync(dir)) return []; const out: AgentConfig[] = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.name.endsWith(".md") || (!ent.isFile() && !ent.isSymbolicLink())) continue;
    const filePath = path.join(dir, ent.name); let text: string; try { text = fs.readFileSync(filePath, "utf8"); } catch { continue; }
    const { frontmatter, body } = parseFrontmatter<Record<string, unknown>>(text);
    const name = scalar(frontmatter.name) || ent.name.slice(0, -3);
    const description = scalar(frontmatter.description);
    if (!description) { diagnostics.push(`${filePath}: missing description`); continue; }
    let prompt = body;
    const ref = /^\{file:(.+)\}$/.exec(prompt.trim());
    if (ref) { try { prompt = fs.readFileSync(path.resolve(dir, ref[1].trim()), "utf8"); } catch { diagnostics.push(`${filePath}: prompt file not found: ${ref[1]}`); } }
    const mode = (scalar(frontmatter.mode) || "subagent") as AgentConfig["mode"];
    if (!["subagent","primary","all"].includes(mode)) { diagnostics.push(`${filePath}: invalid mode`); continue; }
    out.push({ name, description, mode, model: scalar(frontmatter.model), prompt, steps: Number(frontmatter.steps) || undefined, hidden: bool(frontmatter.hidden), disabled: bool(frontmatter.disable) || bool(frontmatter.disabled), permissions: rules(frontmatter.permission ?? frontmatter.permissions), source, filePath });
  } return out;
}
export function discoverAgents(cwd: string): Discovery {
  const diagnostics: string[] = []; const global = path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "~", ".config"), "opencode", "agents");
  const project = projectDir(cwd); const map = new Map<string, AgentConfig>();
  for (const a of load(global, "user", diagnostics)) map.set(a.name, a);
  for (const a of load(project || "", "project", diagnostics)) map.set(a.name, a);
  return { agents: [...map.values()].filter(a => !a.disabled && !a.hidden && (a.mode === "subagent" || a.mode === "all")), projectDir: project, diagnostics };
}
export function matches(pattern: string, value: string): boolean { const re = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$", "i"); return re.test(value); }
export function effectiveTools(agent: AgentConfig, parentDenied: string[] = []): string[] {
  const all = ["read","bash","edit","write","grep","find","ls"];
  const denied = new Set(["task","todo","todowrite", ...parentDenied]);
  for (const r of agent.permissions) if (r.action === "deny") for (const t of [...all, "task"]) if (matches(r.pattern, t)) denied.add(t);
  if (agent.permissions.some(r => r.action === "allow" && matches(r.pattern, "task")) && !agent.permissions.some(r => r.action === "deny" && matches(r.pattern, "task"))) { denied.delete("task"); all.push("task"); }
  return all.filter(t => !denied.has(t));
}
