import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";

// Use Pi's existing TypeScript loader, without installing test dependencies.
const { createJiti } = createRequire(import.meta.url)("jiti");
const { SettingsStorage } = await createJiti(import.meta.url).import("../src/config/settings-storage.ts");

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "token-speed-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "token-speed.json");
  return { dir, path, storage: new SettingsStorage(path) };
}

async function read(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

test("missing settings can be initialized without touching Pi settings", async (t) => {
  const { dir, path, storage } = await fixture(t);
  const sharedPath = join(dir, "settings.json");
  const shared = '{"packages":["local-package"],"other":true}\n';
  await writeFile(sharedPath, shared);
  assert.deepEqual(await storage.read(), {});
  await storage.writeTokenSpeedBlock({ display: "full" });
  assert.equal((await read(path)).tokenSpeed.display, "full");
  assert.equal(await readFile(sharedPath, "utf-8"), shared);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("malformed and non-object JSON is never overwritten", async (t) => {
  const { dir, path, storage } = await fixture(t);
  for (const original of ['{"broken":', "null", "[]", '"string"', "42"]) {
    await writeFile(path, original);
    await assert.rejects(storage.read());
    await assert.rejects(storage.writeTokenSpeedBlock({ display: "full" }));
    await assert.rejects(storage.deleteTokenSpeedKeys(["display"]));
    assert.equal(await readFile(path, "utf-8"), original);
    assert.deepEqual(await readdir(dir), ["token-speed.json"]);
  }
});

test("read errors other than ENOENT propagate", async (t) => {
  const { path, storage } = await fixture(t);
  await mkdir(path);
  await assert.rejects(storage.read(), { code: "EISDIR" });
  await assert.rejects(storage.writeTokenSpeedBlock({ display: "full" }), { code: "EISDIR" });
  assert.equal((await stat(path)).isDirectory(), true);
});

test("merges nested values and preserves unrelated fields", async (t) => {
  const { path, storage } = await fixture(t);
  await writeFile(path, JSON.stringify({ other: true, tokenSpeed: { thresholds: { slow: 1 }, colors: { slow: "#112233" } } }));
  await storage.writeTokenSpeedBlock({ thresholds: { fast: 9 }, colors: { fast: "#aabbcc" } });
  const result = await read(path);
  assert.equal(result.other, true);
  assert.deepEqual(result.tokenSpeed.thresholds, { slow: 1, fast: 9 });
  assert.deepEqual(result.tokenSpeed.colors, { slow: "#112233", fast: "#aabbcc" });
});

test("deletes scalar and nested keys without deleting siblings", async (t) => {
  const { path, storage } = await fixture(t);
  await writeFile(path, JSON.stringify({ other: true, tokenSpeed: { display: "full", icon: "x", thresholds: { slow: 1, fast: 9 } } }));
  await storage.deleteTokenSpeedKeys(["display", "thresholds.slow", "missing"]);
  assert.deepEqual(await read(path), { other: true, tokenSpeed: { icon: "x", thresholds: { fast: 9 } } });
  await storage.deleteTokenSpeedKeys(["icon", "thresholds.fast"]);
  assert.deepEqual(await read(path), { other: true });
});

test("concurrent instances preserve all updates and remove temporary files", async (t) => {
  const { dir, path } = await fixture(t);
  await Promise.all(Array.from({ length: 12 }, (_, i) =>
    new SettingsStorage(path).writeTokenSpeedBlock({ [`field${i}`]: i }),
  ));
  const result = await read(path);
  for (let i = 0; i < 12; i++) assert.equal(result.tokenSpeed[`field${i}`], i);
  assert.deepEqual(await readdir(dir), ["token-speed.json"]);
});

test("independent processes preserve concurrent updates", async (t) => {
  const { path } = await fixture(t);
  const moduleURL = new URL("../src/config/settings-storage.ts", import.meta.url).href;
  const run = (i) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e",
      `import { createRequire } from 'node:module'; const { createJiti } = createRequire(${JSON.stringify(import.meta.url)})('jiti'); const { SettingsStorage } = await createJiti(${JSON.stringify(import.meta.url)}).import(${JSON.stringify(moduleURL)}); await new SettingsStorage(${JSON.stringify(path)}).writeTokenSpeedBlock({field${i}: ${i}});`,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(stderr)));
  });
  await Promise.all(Array.from({ length: 6 }, (_, i) => run(i)));
  const result = await read(path);
  for (let i = 0; i < 6; i++) assert.equal(result.tokenSpeed[`field${i}`], i);
});

test("an existing lock fails closed and is not removed", async (t) => {
  const { path, storage } = await fixture(t);
  const original = '{"other":true}';
  await writeFile(path, original);
  await mkdir(`${path}.lock`);
  await assert.rejects(storage.writeTokenSpeedBlock({ display: "full" }), /Settings are locked/);
  assert.equal(await readFile(path, "utf-8"), original);
  assert.equal((await stat(`${path}.lock`)).isDirectory(), true);
});
