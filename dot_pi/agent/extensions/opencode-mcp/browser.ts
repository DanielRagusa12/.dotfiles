import { Context, Effect, Layer } from "effect";
import open from "open";
export interface BrowserShape { open(url: string): Effect.Effect<void, Error> }
export class BrowserService extends Context.Service<BrowserService, BrowserShape>()("pi/opencode-mcp/Browser") {}
export const browserLayer = Layer.succeed(BrowserService, BrowserService.of({ open: (url) => Effect.tryPromise({ try: async () => { const child = await open(url); await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 500); child.once("error", (e) => { clearTimeout(timer); reject(e); }); child.once("exit", (code) => { if (code && code !== 0) { clearTimeout(timer); reject(new Error(`Browser exited with ${code}`)); } }); }); }, catch: (e) => e instanceof Error ? e : new Error(String(e)) }) }));
export async function openBrowser(url: string) { const child = await open(url); await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, 500); child.once("error", (e) => { clearTimeout(timer); reject(e); }); }); }
