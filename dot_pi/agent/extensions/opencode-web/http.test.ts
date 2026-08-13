import { describe, expect, test } from "bun:test";
import { checksum, collectBoundedBody, extractUrls, withTimeout } from "./http.ts";

describe("http helpers", () => {
  test("matches OpenCode's FNV-1a checksum", () => {
    expect(checksum("ses_0196aabbccddeeff001122334455")).toBe("c3kyan");
    expect(checksum("")).toBeUndefined();
  });

  test("extracts and de-duplicates URLs", () => {
    expect(extractUrls("See https://a.test/x, then https://b.test/y. Again https://a.test/x")).toEqual([
      "https://a.test/x",
      "https://b.test/y",
    ]);
    expect(extractUrls(String.raw`{"url":"https://example.test/path\\n","title":"Example"}`)).toEqual([
      "https://example.test/path",
    ]);
  });

  test("collects a bounded streamed response", async () => {
    const response = new Response(new Blob(["hello", " world"]));
    expect(new TextDecoder().decode(await collectBoundedBody(response, 20, "large"))).toBe("hello world");
  });

  test("rejects declared and streamed oversized responses", async () => {
    await expect(
      collectBoundedBody(new Response("small", { headers: { "content-length": "99" } }), 10, "large"),
    ).rejects.toThrow("large");
    await expect(collectBoundedBody(new Response("01234567890"), 10, "large")).rejects.toThrow("large");
  });

  test("times out and honors caller cancellation", async () => {
    await expect(
      withTimeout(5, undefined, (signal) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }), "timed out"),
    ).rejects.toThrow("timed out");

    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(withTimeout(1000, controller.signal, () => fetch("http://127.0.0.1", { signal: controller.signal }), "timed out"))
      .rejects.toThrow("cancelled");
  });
});
