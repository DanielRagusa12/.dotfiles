import { mkdir, mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { PartialConfig } from "./types";

/**
 * Reads and writes the extension's ~/.pi/agent/token-speed.json file.
 *
 * Handles the settings file format: a top-level JSON object containing a
 * `"tokenSpeed"` key (the TokenSpeed settings block). All file I/O is
 * isolated here so the `Settings` class can be tested without touching disk.
 */
export class SettingsStorage {
  /**
   * @param settingsPath Path to the settings JSON file.
   */
  constructor(private readonly settingsPath: string) {}

  /**
   * Only a missing file means empty settings. All other read/parse errors
   * propagate so a later update cannot silently replace unreadable data.
   */
  async read(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(this.settingsPath, "utf-8");
      const data: unknown = JSON.parse(raw);
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        throw new Error(`Expected a JSON object in ${this.settingsPath}`);
      }
      return data as Record<string, unknown>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  /** Serialize updates across sessions, then replace the file atomically. */
  private async update(
    mutate: (data: Record<string, unknown>) => void,
  ): Promise<void> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    const lockPath = `${this.settingsPath}.lock`;
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(lockPath, { mode: 0o700 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (attempt >= 100) {
          throw new Error(`Settings are locked: ${lockPath}. If a session crashed, remove the lock only after all Pi sessions have exited.`);
        }
        await delay(25);
      }
    }

    try {
      const data = await this.read();
      mutate(data);
      const text = JSON.stringify(data, null, 2);
      const tempDir = await mkdtemp(join(dirname(this.settingsPath), ".token-speed-"));
      try {
        const tempPath = join(tempDir, "settings.json");
        const file = await open(tempPath, "wx", 0o600);
        try {
          await file.writeFile(text, "utf-8");
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(tempPath, this.settingsPath);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    } finally {
      await rm(lockPath, { recursive: true });
    }
  }

  /**
   * Reads the settings file and extracts the raw `"tokenSpeed"` block.
   *
   * @returns The raw TokenSpeed settings object, or an empty object if
   *   missing, null, or not an object.
   */
  async readTokenSpeedBlock(): Promise<Record<string, unknown>> {
    const settings = await this.read();
    return this.readNestedGroup<Record<string, unknown>>(
      settings,
      "tokenSpeed",
    );
  }

  /**
   * Writes a partial TokenSpeedConfig into the settings file, merging it
   * with existing values under the `"tokenSpeed"` key.
   *
   * Only explicitly-set values are persisted: the partial should contain
   * just the keys/tiers the user changed (nested groups are merged per-tier).
   * Defaults are never written unless the user explicitly sets them.
   *
   * @param partial The partial TokenSpeedConfig to write.
   */
  async writeTokenSpeedBlock(partial: PartialConfig): Promise<void> {
    await this.update((settings) => {
      const raw =
        this.readNestedGroup<Record<string, unknown>>(settings, "tokenSpeed") ||
        {};

      const block = mergeConfig(raw as PartialConfig, {
        ...partial,
        thresholds: {
          ...(raw.thresholds as Record<string, unknown>),
          ...partial.thresholds,
        },
        colors: { ...(raw.colors as Record<string, unknown>), ...partial.colors },
      }) as unknown as Record<string, unknown>;

      // Omit empty groups
      if (Object.keys(block.thresholds ?? {}).length === 0) {
        delete block.thresholds;
      }
      if (Object.keys(block.colors ?? {}).length === 0) {
        delete block.colors;
      }
      if (Object.keys(block.providerOverrides ?? {}).length === 0) {
        delete block.providerOverrides;
      }

      if (Object.keys(block).length > 0) {
        settings["tokenSpeed"] = block;
      } else {
        delete settings["tokenSpeed"];
      }
    });
  }

  /**
   * Deletes keys from the raw "tokenSpeed" block in the settings file.
   *
   * Supports dotted keys to remove a single tier from a nested group
   * (e.g. "thresholds.slow"); when the nested group becomes empty it is
   * removed entirely. Plain keys (e.g. "display", "thresholds") are
   * removed as-is, and the "tokenSpeed" block itself is dropped when
   * nothing remains.
   *
   * @param keys The keys to delete from the tokenSpeed block.
   */
  async deleteTokenSpeedKeys(keys: string[]): Promise<void> {
    await this.update((settings) => {
      const block =
        this.readNestedGroup<Record<string, unknown>>(settings, "tokenSpeed") ||
        {};

      for (const key of keys) {
        const dot = key.indexOf(".");
        if (dot === -1) {
          delete block[key];
          continue;
        }
        const group = key.slice(0, dot);
        const tier = key.slice(dot + 1);
        // readNestedGroup returns the live nested object, so mutating it
        // updates the block in place; a fresh {} means the group was absent.
        const nested = this.readNestedGroup<Record<string, unknown>>(
          block,
          group,
        );
        if (tier in nested) {
          delete nested[tier];
          if (Object.keys(nested).length === 0) {
            delete block[group];
          }
        }
      }

      if (Object.keys(block).length > 0) {
        settings["tokenSpeed"] = block;
      } else {
        delete settings["tokenSpeed"];
      }
    });
  }

  /**
   * Safely reads a nested object group from a raw block.
   *
   * @param block The raw settings block to read from.
   * @param group The key of the nested group to extract.
   * @returns A partial object of the group, or an empty object if the
   *   value is missing, null, or an array.
   */
  private readNestedGroup<T extends object>(
    block: Record<string, unknown>,
    group: string,
  ): Partial<T> {
    const value = block[group];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Partial<T>;
  }
}

/**
 * Shallow-merges two partial configs, merging the nested `thresholds`
 * and `colors` groups per-tier so partials never wipe sibling tiers.
 *
 * @internal Used internally by `SettingsStorage` and `Settings`.
 */
export function mergeConfig(
  base: PartialConfig,
  partial: PartialConfig,
): PartialConfig {
  return {
    ...base,
    ...partial,
    thresholds: { ...base.thresholds, ...partial.thresholds },
    colors: { ...base.colors, ...partial.colors },
    displayColors: { ...base.displayColors, ...partial.displayColors },
  };
}
