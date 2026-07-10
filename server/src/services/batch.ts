import pLimit from 'p-limit';
import { processPost } from './pipeline';
import { savePostResult } from '../db/repository';
import { withRetry } from '../utils/retry';
import { extractShortcode } from '../utils/postId';
import { postExists, getPostBrief } from '../db/queries';
import { CONCURRENCY } from '../config';

export interface BatchItemResult {
  url: string;
  ok: boolean;
  skipped?: boolean; // da tai roi -> bo qua
  username?: string;
  caption?: string;
  mediaOk?: number;
  mediaFail?: number;
  entries?: number;
  scrapeError?: string;
  error?: string;
}

export type BatchProgress = (item: BatchItemResult, done: number, total: number) => void;
export type BatchLog = (url: string, message: string) => void;

export interface RunBatchOpts {
  concurrency?: number;
  force?: boolean; // true = khong dedup, cao lai ca bai da co
  onProgress?: BatchProgress;
  onLog?: BatchLog;
}

/**
 * Chay nhieu URL qua pipeline day du, gioi han song song + retry, luu DB.
 * Bai da co trong DB (theo post_id) se bi bo qua tru khi force=true.
 */
export async function runBatch(urls: string[], opts: RunBatchOpts = {}): Promise<BatchItemResult[]> {
  const { concurrency = CONCURRENCY, force = false, onProgress, onLog } = opts;
  const limit = pLimit(concurrency);
  const total = urls.length;
  let done = 0;

  const tasks = urls.map((url) =>
    limit(async (): Promise<BatchItemResult> => {
      const log = (m: string) => onLog?.(url, m);
      let item: BatchItemResult;
      try {
        const postId = extractShortcode(url);
        if (!force && postExists(postId)) {
          const brief = getPostBrief(postId);
          item = {
            url,
            ok: true,
            skipped: true,
            username: brief?.username ?? '',
            caption: brief?.caption ?? '',
            entries: brief?.shopee_count ?? 0,
          };
          log('Đã tải rồi — bỏ qua');
        } else {
          const result = await withRetry(() => processPost(url, log), { retries: 2, label: url });
          savePostResult(result);
          const mediaOk = result.files.filter((f) => f.ok).length;
          item = {
            url,
            ok: true,
            username: result.username,
            caption: result.caption,
            mediaOk,
            mediaFail: result.files.length - mediaOk,
            entries: result.entries.length,
            scrapeError: result.scrapeError,
          };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        item = { url, ok: false, error: msg };
        log(`LỖI: ${msg}`);
      }

      done++;
      const tag = item.ok ? (item.skipped ? 'SKIP' : 'OK') : 'FAIL';
      console.log(`[${done}/${total}] ${tag} ${url}`);
      onProgress?.(item, done, total);
      return item;
    }),
  );

  return Promise.all(tasks);
}
