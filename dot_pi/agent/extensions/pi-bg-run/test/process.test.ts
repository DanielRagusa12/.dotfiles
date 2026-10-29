import assert from "node:assert/strict";
import { test } from "node:test";
import { realPort } from "../src/process.ts";

test("invalid task PIDs never reach process signaling", () => {
  for (const pid of [-1, 0, 1, NaN, Infinity, 1.5]) {
    assert.throws(() => realPort.killTree(pid), /invalid task PID/);
  }
});
