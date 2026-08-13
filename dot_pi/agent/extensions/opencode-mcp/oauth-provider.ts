// Adapted from anomalyco/opencode v1.18.18 (MIT); see NOTICE.md.
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientMetadata, OAuthTokens, OAuthClientInformation, OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthConfig } from "./config.ts";
import { AuthStore } from "./auth-store.ts";
export const OAUTH_CALLBACK_PORT = 19876;
export const OAUTH_CALLBACK_PATH = "/mcp/oauth/callback";
export class McpOAuthProvider implements OAuthClientProvider {
  constructor(protected name: string, protected serverUrl: string, protected config: OAuthConfig, private onRedirect: (url: URL) => void | Promise<void>, protected store: AuthStore) {}
  get redirectUrl() { return this.config.redirectUri ?? `http://127.0.0.1:${this.config.callbackPort ?? OAUTH_CALLBACK_PORT}${OAUTH_CALLBACK_PATH}`; }
  get clientMetadata(): OAuthClientMetadata { return { redirect_uris: [this.redirectUrl], client_name: "Pi OpenCode MCP", client_uri: "https://github.com/earendil-works/pi-mono", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: this.config.clientSecret ? "client_secret_post" : "none", ...(this.config.scope ? { scope: this.config.scope } : {}) }; }
  async clientInformation(): Promise<OAuthClientInformation | undefined> { if (this.config.clientId) return { client_id: this.config.clientId, client_secret: this.config.clientSecret }; const e = await this.store.getForUrl(this.name, this.serverUrl); if (e?.clientInfo?.clientSecretExpiresAt && e.clientInfo.clientSecretExpiresAt < Date.now() / 1000) return; return e?.clientInfo ? { client_id: e.clientInfo.clientId, client_secret: e.clientInfo.clientSecret } : undefined; }
  async saveClientInformation(info: OAuthClientInformationFull) { await this.store.update(this.name, { clientInfo: { clientId: info.client_id, clientSecret: info.client_secret, clientIdIssuedAt: info.client_id_issued_at, clientSecretExpiresAt: info.client_secret_expires_at } }, this.serverUrl); }
  async tokens(): Promise<OAuthTokens | undefined> { const t = (await this.store.getForUrl(this.name, this.serverUrl))?.tokens; return t ? { access_token: t.accessToken, token_type: "Bearer", refresh_token: t.refreshToken, expires_in: t.expiresAt ? Math.max(0, Math.floor(t.expiresAt - Date.now() / 1000)) : undefined, scope: t.scope } : undefined; }
  async saveTokens(t: OAuthTokens) { await this.store.update(this.name, { tokens: { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: t.expires_in ? Date.now() / 1000 + t.expires_in : undefined, scope: t.scope } }, this.serverUrl); }
  async redirectToAuthorization(url: URL) { await this.onRedirect(url); }
  async saveCodeVerifier(value: string) { await this.store.update(this.name, { codeVerifier: value }); }
  async codeVerifier() { const value = (await this.store.get(this.name))?.codeVerifier; if (!value) throw new Error(`No code verifier saved for MCP server: ${this.name}`); return value; }
  async saveState(value: string) { await this.store.update(this.name, { oauthState: value }); }
  async state() { const old = (await this.store.get(this.name))?.oauthState; if (old) return old; const value = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""); await this.saveState(value); return value; }
  async invalidateCredentials(type: "all" | "client" | "tokens") { if (type === "all") return this.store.remove(this.name); if (type === "client") return this.store.clear(this.name, "clientInfo"); return this.store.clear(this.name, "tokens"); }
}
export class PendingOAuthProvider extends McpOAuthProvider {
  private pendingClient?: OAuthClientInformationFull; private pendingTokens?: OAuthTokens;
  override async clientInformation() { return this.config.clientId ? { client_id: this.config.clientId, client_secret: this.config.clientSecret } : this.pendingClient; }
  override async saveClientInformation(value: OAuthClientInformationFull) { this.pendingClient = value; }
  override async tokens() { return this.pendingTokens; }
  override async saveTokens(value: OAuthTokens) { this.pendingTokens = value; }
  override async invalidateCredentials(type: "all" | "client" | "tokens") { if (type !== "tokens") this.pendingClient = undefined; if (type !== "client") this.pendingTokens = undefined; }
  async commit() { if (!this.pendingTokens) return; await this.store.set(this.name, { tokens: { accessToken: this.pendingTokens.access_token, refreshToken: this.pendingTokens.refresh_token, expiresAt: this.pendingTokens.expires_in ? Date.now() / 1000 + this.pendingTokens.expires_in : undefined, scope: this.pendingTokens.scope }, clientInfo: this.pendingClient && !this.config.clientId ? { clientId: this.pendingClient.client_id, clientSecret: this.pendingClient.client_secret, clientIdIssuedAt: this.pendingClient.client_id_issued_at, clientSecretExpiresAt: this.pendingClient.client_secret_expires_at } : undefined }, this.serverUrl); }
}
export function parseRedirectUri(value?: string) { try { if (!value) throw 0; const u = new URL(value); if (u.hostname !== "127.0.0.1" || u.protocol !== "http:") throw new Error("OAuth redirectUri must use http://127.0.0.1"); return { port: Number(u.port || 80), path: u.pathname || OAUTH_CALLBACK_PATH }; } catch (e) { if (e instanceof Error) throw e; return { port: OAUTH_CALLBACK_PORT, path: OAUTH_CALLBACK_PATH }; } }
