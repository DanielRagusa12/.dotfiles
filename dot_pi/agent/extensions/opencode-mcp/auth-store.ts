// Adapted from anomalyco/opencode v1.18.18 (MIT); see NOTICE.md.
import { Context, Effect, Layer } from "effect";
import { chmod, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredTokens { accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string }
export interface StoredClientInfo { clientId: string; clientSecret?: string; clientIdIssuedAt?: number; clientSecretExpiresAt?: number }
export interface AuthEntry { tokens?: StoredTokens; clientInfo?: StoredClientInfo; codeVerifier?: string; oauthState?: string; serverUrl?: string }
type AuthData = Record<string, AuthEntry>;
export const AUTH_PATH = join(homedir(), ".pi", "agent", "mcp-auth.json");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export class AuthStore {
  constructor(readonly path = AUTH_PATH) {}
  private async readUnlocked(): Promise<AuthData> {
    try { const value = JSON.parse(await readFile(this.path, "utf8")); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
    catch (error: any) { if (error?.code === "ENOENT" || error instanceof SyntaxError) return {}; throw error; }
  }
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 }); const lock = `${this.path}.lock`;
    for (let attempt = 0; ; attempt++) {
      try {
        const handle = await open(lock, "wx", 0o600); await handle.writeFile(`${process.pid}\n${Date.now()}\n`); await handle.close(); break;
      } catch (error: any) {
        if (error?.code !== "EEXIST") throw error;
        try { if (Date.now() - (await stat(lock)).mtimeMs > 30_000) { await unlink(lock); continue; } } catch {}
        if (attempt >= 200) throw new Error("Timed out acquiring MCP auth-store lock");
        await sleep(Math.min(10 + attempt * 2, 100));
      }
    }
    try { return await fn(); } finally { await unlink(lock).catch(() => {}); }
  }
  async all(): Promise<AuthData> { return this.withLock(() => this.readUnlocked()); }
  async get(name: string): Promise<AuthEntry | undefined> { return (await this.all())[name]; }
  async getForUrl(name: string, url: string): Promise<AuthEntry | undefined> { const entry = await this.get(name); return entry?.serverUrl === url ? entry : undefined; }
  async mutate(update: (data: AuthData) => AuthData | void): Promise<void> {
    await this.withLock(async () => {
      const current = await this.readUnlocked(); const next = update(current) ?? current;
      const temp = `${this.path}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 }); await chmod(temp, 0o600); await rename(temp, this.path); await chmod(this.path, 0o600);
    });
  }
  async set(name: string, entry: AuthEntry, serverUrl?: string) { await this.mutate((data) => ({ ...data, [name]: serverUrl ? { ...entry, serverUrl } : entry })); }
  async remove(name: string) { await this.mutate((data) => { const next = { ...data }; delete next[name]; return next; }); }
  async update(name: string, patch: Partial<AuthEntry>, serverUrl?: string) { await this.mutate((data) => ({ ...data, [name]: { ...(data[name] ?? {}), ...patch, ...(serverUrl ? { serverUrl } : {}) } })); }
  async clear(name: string, field: keyof AuthEntry) { await this.mutate((data) => { if (!data[name]) return data; const entry = { ...data[name] }; delete entry[field]; return { ...data, [name]: entry }; }); }
  async redacted(): Promise<AuthData> { const data = await this.all(); return JSON.parse(JSON.stringify(data, (key, value) => /token|secret|verifier|state/i.test(key) && typeof value === "string" ? "<redacted>" : value)); }
}

export interface AuthServiceShape { readonly store: AuthStore }
export class AuthService extends Context.Service<AuthService, AuthServiceShape>()("pi/opencode-mcp/Auth") {}
export const authLayer = (path = AUTH_PATH) => Layer.succeed(AuthService, AuthService.of({ store: new AuthStore(path) }));
export const authEffect = <A>(fn: (store: AuthStore) => Promise<A>) => Effect.flatMap(AuthService, ({ store }) => Effect.tryPromise(() => fn(store)));
