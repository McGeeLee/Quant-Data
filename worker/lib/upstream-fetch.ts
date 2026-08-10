import { AppError } from "./app-error";

const RETRYABLE = new Set([502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 10_000;

function retryDelay(response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  if (!retryAfter) return 250;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1_000, 0), 2_000);
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.min(Math.max(date - Date.now(), 0), 2_000) : 250;
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
        if (attempt === 0) {
          await delay(retryDelay(response));
          continue;
        }
        throw new AppError("UPSTREAM_RATE_LIMITED", 503, { upstreamStatus: 429 });
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

export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    throw new AppError("UPSTREAM_ERROR", 502, { reason: "invalid_json" }, { cause: error });
  }
}
