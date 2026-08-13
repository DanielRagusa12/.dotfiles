export const DEFAULT_MAX_BYTES = 50 * 1024;
export const DEFAULT_MAX_LINES = 2000;

export interface TruncationResult {
  content: string;
  truncated: boolean;
  totalLines: number;
  totalBytes: number;
  outputLines: number;
  outputBytes: number;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))}KB`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1))}MB`;
}

export function truncateHead(
  text: string,
  options: { maxLines?: number; maxBytes?: number } = {},
): TruncationResult {
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const lines = text.split("\n");
  const totalBytes = Buffer.byteLength(text, "utf8");
  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return {
      content: text,
      truncated: false,
      totalLines: lines.length,
      totalBytes,
      outputLines: lines.length,
      outputBytes: totalBytes,
    };
  }

  const output: string[] = [];
  let outputBytes = 0;
  for (let index = 0; index < lines.length && index < maxLines; index++) {
    const separatorBytes = index > 0 ? 1 : 0;
    const lineBytes = Buffer.byteLength(lines[index]!, "utf8");
    if (outputBytes + separatorBytes + lineBytes > maxBytes) break;
    output.push(lines[index]!);
    outputBytes += separatorBytes + lineBytes;
  }
  return {
    content: output.join("\n"),
    truncated: true,
    totalLines: lines.length,
    totalBytes,
    outputLines: output.length,
    outputBytes,
  };
}

export async function withTimeout<T>(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMessage: string,
): Promise<T> {
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(new Error(timeoutMessage)), timeoutMs);
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;

  try {
    return await operation(signal);
  } catch (error) {
    if (timeoutController.signal.aborted && !callerSignal?.aborted) {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function collectBoundedBody(
  response: Response,
  maxBytes: number,
  errorMessage: string,
): Promise<Uint8Array> {
  const declared = response.headers.get("content-length");
  if (declared && Number.parseInt(declared, 10) > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(errorMessage);
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel(errorMessage).catch(() => undefined);
        throw new Error(errorMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function checksum(content: string): string | undefined {
  if (!content) return undefined;
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index++) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function extractUrls(text: string | undefined): string[] {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s<>"'`\])}]+/g) ?? [];
  return [
    ...new Set(matches.map((url) => url.split(/\\[nrt]/, 1)[0]!.replace(/\\+$/, "").replace(/[.,;:!?]+$/, ""))),
  ];
}
