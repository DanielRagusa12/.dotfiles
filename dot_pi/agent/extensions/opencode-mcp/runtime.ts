import { Context, Effect, Exit, Layer, Scope } from "effect";
import type { McpConfig } from "./config.ts";
import { McpManager } from "./manager.ts";
import { AuthService, authLayer } from "./auth-store.ts";
import { BrowserService, browserLayer } from "./browser.ts";
import { stopCallbacks } from "./oauth-callback.ts";
export interface ConfigShape { config: McpConfig; cwd: string }
export class ConfigService extends Context.Service<ConfigService, ConfigShape>()("pi/opencode-mcp/Config") {}
export interface ManagerShape { manager: McpManager }
export class ManagerService extends Context.Service<ManagerService, ManagerShape>()("pi/opencode-mcp/Manager") {}
export interface CallbackShape { stop(): Promise<void> }
export class CallbackService extends Context.Service<CallbackService, CallbackShape>()("pi/opencode-mcp/Callback") {}
export const callbackLayer = Layer.succeed(CallbackService, CallbackService.of({ stop: stopCallbacks }));
export const configLayer = (config: McpConfig, cwd: string) => Layer.succeed(ConfigService, ConfigService.of({ config, cwd }));
export const managerLayer = Layer.effect(ManagerService, Effect.gen(function* () { const { config, cwd } = yield* ConfigService; const { store } = yield* AuthService; return ManagerService.of({ manager: new McpManager(config, cwd, store) }); }));
export const applicationLayer = (config: McpConfig, cwd: string) => Layer.mergeAll(
  managerLayer.pipe(Layer.provide(configLayer(config, cwd)), Layer.provide(authLayer())),
  configLayer(config, cwd), authLayer(), browserLayer, callbackLayer,
);
/** Session-owned Effect scope. acquireRelease guarantees manager cleanup on interruption/shutdown. */
export class McpRuntime {
  private scope?: Scope.Closeable; manager?: McpManager;
  constructor(readonly config: McpConfig, readonly cwd: string, readonly changed: () => void | Promise<void>, readonly log: (level: string, message: string) => void) {}
  async start() { this.scope = await Effect.runPromise(Scope.make()); const acquire = Effect.acquireRelease(Effect.sync(() => new McpManager(this.config, this.cwd, undefined, this.changed, this.log)), (manager) => Effect.promise(() => manager.close())); this.manager = await Effect.runPromise(Scope.provide(acquire, this.scope)); await this.manager.start(); return this.manager; }
  async close() { if (!this.scope) return; await Effect.runPromise(Scope.close(this.scope, Exit.void)); this.scope = undefined; this.manager = undefined; }
}
export type ApplicationServices = ConfigService | AuthService | BrowserService | ManagerService | CallbackService;
