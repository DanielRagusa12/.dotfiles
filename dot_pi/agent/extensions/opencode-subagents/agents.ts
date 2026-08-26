import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentSource = "builtin" | "user" | "project";
export type PermissionAction = "allow" | "deny" | "ask";
export interface PermissionRule { action: PermissionAction; pattern: string; }
export interface AgentConfig {
  name: string;
  description: string;
  mode: "subagent" | "primary" | "all";
  model?: string;
  prompt: string;
  steps?: number;
  hidden: boolean;
  disabled: boolean;
  permissions: PermissionRule[];
  source: AgentSource;
  filePath: string;
}
export interface Discovery { agents: AgentConfig[]; projectDir: string | null; diagnostics: string[]; }

const BUILTIN_AGENTS: AgentConfig[] = [
  {
    name: "general",
    description: "General-purpose agent for implementation, debugging, and multi-step work.",
    mode: "subagent",
    prompt: "Work autonomously on the delegated task. Inspect the repository, make changes when requested, run relevant checks, and report concrete results with file paths.",
    hidden: false,
    disabled: false,
    permissions: [],
    source: "builtin",
    filePath: "<builtin:general>",
  },
  {
    name: "explore",
    description: "Read-only agent for locating code, tracing behavior, and returning concise findings.",
    mode: "subagent",
    prompt: "Explore the repository without modifying it. Locate relevant files and symbols, trace how they connect, and return concise findings with exact file paths and line references.",
    hidden: false,
    disabled: false,
    permissions: [
      { action: "deny", pattern: "bash" },
      { action: "deny", pattern: "edit" },
      { action: "deny", pattern: "write" },
    ],
    source: "builtin",
    filePath: "<builtin:explore>",
  },
];

function scalar(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function bool(value: unknown, fallback = false): boolean {
  return value === true || value === "true" || (value === undefined && fallback);
}

function parseRule(value: string): PermissionRule | undefined {
  const match = /^(allow|deny|ask)\s*:\s*(.+)$/i.exec(value);
  return match ? { action: match[1].toLowerCase() as PermissionAction, pattern: match[2] } : undefined;
}

function rules(value: unknown): PermissionRule[] {
  if (!value) return [];
  if (typeof value === "string") {
    return value.split(",").map((item) => parseRule(item.trim())).filter(Boolean) as PermissionRule[];
  }
  if (typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([pattern, rawAction]) => {
    const action = String(rawAction) as PermissionAction;
    return ["allow", "deny", "ask"].includes(action) ? [{ action, pattern }] : [];
  });
}

function findProjectDir(cwd: string): string | null {
  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, ".opencode", "agents");
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Keep walking toward the filesystem root.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function load(dir: string, source: Exclude<AgentSource, "builtin">, diagnostics: string[]): AgentConfig[] {
  if (!dir || !fs.existsSync(dir)) return [];
  const agents: AgentConfig[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    diagnostics.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`);
    return agents;
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
    const filePath = path.join(dir, entry.name);
    let text: string;
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      diagnostics.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    let parsed: ReturnType<typeof parseFrontmatter<Record<string, unknown>>>;
    try {
      parsed = parseFrontmatter<Record<string, unknown>>(text);
    } catch (error) {
      diagnostics.push(`${filePath}: invalid frontmatter: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const { frontmatter, body } = parsed;
    const name = scalar(frontmatter.name) || entry.name.slice(0, -3);
    const description = scalar(frontmatter.description);
    if (!description) {
      diagnostics.push(`${filePath}: missing description`);
      continue;
    }

    let prompt = body;
    const reference = /^\{file:(.+)\}$/.exec(prompt.trim());
    if (reference) {
      try {
        prompt = fs.readFileSync(path.resolve(dir, reference[1].trim()), "utf8");
      } catch {
        diagnostics.push(`${filePath}: prompt file not found: ${reference[1]}`);
        continue;
      }
    }

    const mode = (scalar(frontmatter.mode) || "subagent") as AgentConfig["mode"];
    if (!["subagent", "primary", "all"].includes(mode)) {
      diagnostics.push(`${filePath}: invalid mode`);
      continue;
    }

    agents.push({
      name,
      description,
      mode,
      model: scalar(frontmatter.model),
      prompt,
      steps: Number(frontmatter.steps) || undefined,
      hidden: bool(frontmatter.hidden),
      disabled: bool(frontmatter.disable) || bool(frontmatter.disabled),
      permissions: rules(frontmatter.permission ?? frontmatter.permissions),
      source,
      filePath,
    });
  }
  return agents;
}

export function discoverAgents(cwd: string): Discovery {
  const diagnostics: string[] = [];
  const globalDir = path.join(
    process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "~", ".config"),
    "opencode",
    "agents",
  );
  const projectDir = findProjectDir(cwd);
  const agents = new Map<string, AgentConfig>();

  for (const agent of BUILTIN_AGENTS) agents.set(agent.name, agent);
  for (const agent of load(globalDir, "user", diagnostics)) agents.set(agent.name, agent);
  for (const agent of load(projectDir || "", "project", diagnostics)) agents.set(agent.name, agent);

  return {
    agents: [...agents.values()].filter(
      (agent) => !agent.disabled && !agent.hidden && (agent.mode === "subagent" || agent.mode === "all"),
    ),
    projectDir,
    diagnostics,
  };
}

export function matches(pattern: string, value: string): boolean {
  const expression = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
    "i",
  );
  return expression.test(value);
}

export function effectiveTools(
  agent: AgentConfig,
  parentDenied: string[] = [],
  parentActive: string[] = [],
): string[] {
  const tools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
  for (const tool of ["webfetch", "websearch"]) {
    if (parentActive.includes(tool)) tools.push(tool);
  }
  const denied = new Set(["task", "todo", "todowrite", ...parentDenied]);
  for (const rule of agent.permissions) {
    if (rule.action !== "deny" && rule.action !== "ask") continue;
    for (const tool of [...tools, "task"]) if (matches(rule.pattern, tool)) denied.add(tool);
  }
  const taskAllowed = agent.permissions.some((rule) => rule.action === "allow" && matches(rule.pattern, "task"));
  const taskBlocked = agent.permissions.some(
    (rule) => (rule.action === "deny" || rule.action === "ask") && matches(rule.pattern, "task"),
  );
  if (taskAllowed && !taskBlocked) {
    denied.delete("task");
    tools.push("task");
  }
  return tools.filter((tool) => !denied.has(tool));
}
