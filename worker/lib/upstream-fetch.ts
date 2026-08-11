import { AppError } from "./app-error";

const RETRYABLE = new Set([502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRY_DELAY_MS = 2_000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;

function retryDelay(response?: Response): { milliseconds: number; seconds: number } {
  const retryAfter = response?.headers.get("retry-after");
  if (!retryAfter) return { milliseconds: 250, seconds: 1 };
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    const normalized = Math.max(seconds, 0);
    return { milliseconds: normalized * 1_000, seconds: Math.ceil(normalized) };
  }
  const date = Date.parse(retryAfter);
  if (Number.isFinite(date)) {
    const milliseconds = Math.max(date - Date.now(), 0);
    return { milliseconds, seconds: Math.ceil(milliseconds / 1_000) };
  }
  return { milliseconds: 250, seconds: 1 };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchUpstream(
  input: RequestInfo | URL,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(input, { ...init, signal: controller.signal });
      if (response.status === 429) {
        const retry = retryDelay(response);
        if (attempt === 0 && retry.milliseconds <= MAX_RETRY_DELAY_MS) {
          await delay(retry.milliseconds);
          continue;
        }
        throw new AppError("UPSTREAM_RATE_LIMITED", 503, {
          upstreamStatus: 429,
          retryAfterSeconds: retry.seconds,
        });
      }
      if (RETRYABLE.has(response.status) && attempt === 0) {
        await delay(250);
        continue;
      }
      if (!response.ok) {
        throw new AppError("UPSTREAM_ERROR", 502, { upstreamStatus: response.status });
      }
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      lastError = error;
      const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      if (aborted) {
        if (attempt === 0) continue;
        throw new AppError("UPSTREAM_TIMEOUT", 504, undefined, { cause: error });
      }
      if (attempt === 0) continue;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError("UPSTREAM_ERROR", 502, undefined, { cause: lastError });
}

export async function readJson(response: Response, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new AppError("UPSTREAM_ERROR", 502, { reason: "payload_too_large" });
  }
  if (!response.body) throw new AppError("UPSTREAM_ERROR", 502, { reason: "empty_body" });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel("payload_too_large");
        throw new AppError("UPSTREAM_ERROR", 502, { reason: "payload_too_large" });
      }
      text += decoder.decode(result.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("UPSTREAM_ERROR", 502, { reason: "invalid_json" }, { cause: error });
  } finally {
    reader.releaseLock();
  }
}
