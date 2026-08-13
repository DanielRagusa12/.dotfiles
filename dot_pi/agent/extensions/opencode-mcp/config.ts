// Adapted from anomalyco/opencode v1.18.18 (MIT); see NOTICE.md.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { applyEdits, modify, parse, type ParseError, printParseErrorCode } from "jsonc-parser";

export interface OAuthConfig { clientId?: string; clientSecret?: string; scope?: string; callbackPort?: number; redirectUri?: string }
interface CommonConfig { enabled?: boolean; timeout?: number }
export interface LocalConfig extends CommonConfig { type: "local"; command: string[]; cwd?: string; environment?: Record<string, string> }
export interface RemoteConfig extends CommonConfig { type: "remote"; url: string; headers?: Record<string, string>; oauth?: false | OAuthConfig }
export type ServerConfig = LocalConfig | RemoteConfig;
export interface McpConfig { servers: Record<string, ServerConfig> }
export interface ConfigDiagnostic { path: string; message: string }
export const GLOBAL_CONFIG_PATH = join(homedir(), ".pi", "agent", "mcp.jsonc");

function interpolate(value: string, missing: Set<string>): string {
  return value.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_all, name: string) => {
    const found = process.env[name];
    if (found === undefined) { missing.add(name); return ""; }
    return found;
  });
}
function strings<T>(value: T, missing: Set<string>): T {
  if (typeof value === "string") return interpolate(value, missing) as T;
  if (Array.isArray(value)) return value.map((v) => strings(v, missing)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, strings(v, missing)])) as T;
  return value;
}
function normalize(name: string, raw: unknown): ServerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`server "${name}" must be an object`);
  const item = raw as Record<string, unknown>;
  if (item.enabled !== undefined && typeof item.enabled !== "boolean") throw new Error(`server "${name}" enabled must be boolean`);
  if (item.timeout !== undefined && (typeof item.timeout !== "number" || !Number.isFinite(item.timeout) || item.timeout <= 0)) throw new Error(`server "${name}" timeout must be a positive number`);
  const type = item.type ?? (Array.isArray(item.command) ? "local" : typeof item.url === "string" ? "remote" : undefined);
  if (type === "local") {
    if (!Array.isArray(item.command) || item.command.length === 0 || item.command.some((x) => typeof x !== "string")) throw new Error(`server "${name}" command must be a non-empty string array`);
    if (item.cwd !== undefined && typeof item.cwd !== "string") throw new Error(`server "${name}" cwd must be a string`);
    if (item.environment !== undefined && (!item.environment || typeof item.environment !== "object" || Array.isArray(item.environment) || Object.values(item.environment).some((x) => typeof x !== "string"))) throw new Error(`server "${name}" environment must contain string values`);
    return { ...item, type, command: item.command } as LocalConfig;
  }
  if (type === "remote") {
    if (typeof item.url !== "string" || !URL.canParse(item.url) || !["http:", "https:"].includes(new URL(item.url).protocol)) throw new Error(`server "${name}" has an invalid HTTP(S) URL`);
    if (item.headers !== undefined && (!item.headers || typeof item.headers !== "object" || Array.isArray(item.headers) || Object.values(item.headers).some((x) => typeof x !== "string"))) throw new Error(`server "${name}" headers must contain string values`);
    if (item.oauth !== undefined && item.oauth !== false && (!item.oauth || typeof item.oauth !== "object" || Array.isArray(item.oauth))) throw new Error(`server "${name}" oauth must be false or an object`);
    if (item.oauth && typeof item.oauth === "object") { const oauth = item.oauth as Record<string, unknown>; for (const key of ["clientId", "clientSecret", "scope", "redirectUri"]) if (oauth[key] !== undefined && typeof oauth[key] !== "string") throw new Error(`server "${name}" oauth.${key} must be a string`); if (oauth.callbackPort !== undefined && (typeof oauth.callbackPort !== "number" || !Number.isInteger(oauth.callbackPort) || oauth.callbackPort < 1 || oauth.callbackPort > 65535)) throw new Error(`server "${name}" oauth.callbackPort must be a valid port`); if (typeof oauth.redirectUri === "string") { let redirect: URL; try { redirect = new URL(oauth.redirectUri); } catch { throw new Error(`server "${name}" oauth.redirectUri is invalid`); } if (redirect.protocol !== "http:" || redirect.hostname !== "127.0.0.1") throw new Error(`server "${name}" oauth.redirectUri must use http://127.0.0.1`); } }
    return { ...item, type, url: item.url } as RemoteConfig;
  }
  throw new Error(`server "${name}" must specify type, command, or url`);
}

export async function readConfigFile(path: string): Promise<{ servers: Record<string, ServerConfig>; diagnostics: ConfigDiagnostic[] }> {
  let text: string;
  try { text = await readFile(path, "utf8"); } catch (error: any) {
    if (error?.code === "ENOENT") return { servers: {}, diagnostics: [] };
    return { servers: {}, diagnostics: [{ path, message: error instanceof Error ? error.message : String(error) }] };
  }
  const errors: ParseError[] = [];
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
  if (errors.length) return { servers: {}, diagnostics: errors.map((e) => ({ path, message: `${printParseErrorCode(e.error)} at offset ${e.offset}` })) };
  if (!value || typeof value !== "object" || Array.isArray(value) || !("servers" in value) || !(value as any).servers || typeof (value as any).servers !== "object" || Array.isArray((value as any).servers)) return { servers: {}, diagnostics: [{ path, message: "configuration must have an object-valued servers property" }] };
  const servers: Record<string, ServerConfig> = {}; const diagnostics: ConfigDiagnostic[] = [];
  for (const [name, raw] of Object.entries((value as any).servers)) {
    try {
      const missing = new Set<string>(); const expanded = strings(raw, missing);
      if (missing.size) throw new Error(`server "${name}" references missing environment variable(s): ${[...missing].sort().join(", ")}`);
      servers[name] = normalize(name, expanded);
    } catch (error) { diagnostics.push({ path, message: error instanceof Error ? error.message : String(error) }); }
  }
  return { servers, diagnostics };
}

export async function loadConfig(cwd: string, projectTrusted: boolean, configDirName = ".pi"): Promise<{ config: McpConfig; diagnostics: ConfigDiagnostic[]; projectPath: string }> {
  const projectPath = join(cwd, configDirName, "mcp.jsonc");
  const global = await readConfigFile(GLOBAL_CONFIG_PATH);
  if (!projectTrusted) return { config: { servers: global.servers }, diagnostics: global.diagnostics, projectPath };
  const project = await readConfigFile(projectPath);
  return { config: { servers: { ...global.servers, ...project.servers } }, diagnostics: [...global.diagnostics, ...project.diagnostics], projectPath };
}

export async function updateServer(path: string, name: string, server: ServerConfig): Promise<void> {
  let text = "{\n  // MCP servers managed by Pi.\n  \"servers\": {}\n}\n";
  try { text = await readFile(path, "utf8"); } catch (error: any) { if (error?.code !== "ENOENT") throw error; }
  const edits = modify(text, ["servers", name], server, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, applyEdits(text, edits), { encoding: "utf8", mode: 0o600 });
}
