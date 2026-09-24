import axios from 'axios';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mot so API (ro nhat la Gemini) KHONG gui header Retry-After ma nhet thoi gian cho vao body:
 * google.rpc.RetryInfo { retryDelay: "25.1s" }, hoac cau "Please retry in 25.1s" trong message.
 * Khong doc cho nay thi ta se thu lai som hon muc API cho phep -> 429 lai, lap vo tan.
 * Body cua Gemini con co the la MANG bao ngoai ([{ error: {...} }]) nen phai go ca hai dang.
 */
function bodyRetryDelayMs(data: unknown): number {
  const root = Array.isArray(data) ? data[0] : data;
  const error = (root as { error?: unknown })?.error;
  if (!error || typeof error !== 'object') return NaN;

  const details = (error as { details?: unknown[] }).details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const item = d as { '@type'?: string; retryDelay?: string };
      if (/RetryInfo$/.test(item['@type'] ?? '') && item.retryDelay) {
        const sec = parseFloat(item.retryDelay);
        if (Number.isFinite(sec) && sec > 0) return Math.ceil(sec * 1000);
      }
    }
  }
  const message = (error as { message?: string }).message ?? '';
  const sec = parseFloat(message.match(/retry in\s+([\d.]+)\s*s/i)?.[1] ?? '');
  return Number.isFinite(sec) && sec > 0 ? Math.ceil(sec * 1000) : NaN;
}

/** Loi 429 (rate limit) can cho lau hon han loi mang thong thuong, tranh spam them vao luc dang bi chan. */
function waitTimeFor(err: unknown, attempt: number, baseMs: number): number {
  if (axios.isAxiosError(err) && err.response?.status === 429) {
    const retryAfterHeader = err.response.headers?.['retry-after'];
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    if (!Number.isNaN(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;
    const fromBody = bodyRetryDelayMs(err.response.data);
    // + 1s bu tru lech dong ho, tranh thu lai som 1 nhip roi dinh 429 tiep
    if (!Number.isNaN(fromBody)) return fromBody + 1000;
    return 15_000 + Math.floor(Math.random() * 3000); // khong biet gi -> cho han 15-18s
  }
  return baseMs * 2 ** attempt + Math.floor(Math.random() * 300);
}

/**
 * Chay fn, neu loi thi thu lai voi backoff tang dan (1s, 2s, 4s...) + jitter.
 * Dung cho loi mang transient (timeout, proxy chap chon, token het han...).
 * Rieng loi 429 (rate limit) se cho lau hon han (15-18s, hoac theo header Retry-After).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseMs?: number;
    label?: string;
    /** Tra false de dung thu lai ngay (vd loi cau hinh - thu lai bao nhieu lan cung the). */
    shouldRetry?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  const { retries = 2, baseMs = 1000, label = '', shouldRetry } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (shouldRetry && !shouldRetry(err)) break;
      if (attempt < retries) {
        const wait = waitTimeFor(err, attempt, baseMs);
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[retry] ${label} that bai lan ${attempt + 1} (${msg}). Thu lai sau ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}
