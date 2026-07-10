function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Chay fn, neu loi thi thu lai voi backoff tang dan (1s, 2s, 4s...) + jitter.
 * Dung cho loi mang transient (timeout, proxy chap chon, token het han...).
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
        const wait = baseMs * 2 ** attempt + Math.floor(Math.random() * 300);
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[retry] ${label} that bai lan ${attempt + 1} (${msg}). Thu lai sau ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}
