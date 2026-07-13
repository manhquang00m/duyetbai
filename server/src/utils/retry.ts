import axios from 'axios';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Loi 429 (rate limit) can cho lau hon han loi mang thong thuong, tranh spam them vao luc dang bi chan. */
function waitTimeFor(err: unknown, attempt: number, baseMs: number): number {
  if (axios.isAxiosError(err) && err.response?.status === 429) {
    const retryAfterHeader = err.response.headers?.['retry-after'];
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    if (!Number.isNaN(retryAfterMs) && retryAfterMs > 0) return retryAfterMs;
    return 15_000 + Math.floor(Math.random() * 3000); // khong co Retry-After -> cho han 15-18s
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
  opts: { retries?: number; baseMs?: number; label?: string } = {},
): Promise<T> {
  const { retries = 2, baseMs = 1000, label = '' } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
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
