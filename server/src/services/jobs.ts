import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import { runBatch, type BatchItemResult } from './batch';
import { rescrapeComments } from './pipeline';
import { closeBrowser, closeShopeeBrowser } from './browser';
import { beautifyVideo, type BeautifyConfig } from './beautify';
import { checkProxy } from './proxyCheck';
import { getPostBrief, getVideoMedia, getShopeeCheckTargets } from '../db/queries';
import { saveScrape, setProcessedFile, setShopeeLinkStatus } from '../db/repository';
import { checkShopeeLink } from './shopeeLinkCheck';
import { withRetry } from '../utils/retry';
import { DOWNLOAD_DIR } from '../config';

export interface JobLog {
  url: string;
  message: string;
}

export interface JobState {
  id: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  items: BatchItemResult[];
  logs: JobLog[];
  error?: string;
}

export interface JobEvent {
  type: 'progress' | 'log' | 'end';
  job: JobState;
  item?: BatchItemResult;
  log?: JobLog;
}

type Listener = (event: JobEvent) => void;

const jobs = new Map<string, JobState>();
const listeners = new Map<string, Set<Listener>>();

function emit(id: string, event: JobEvent): void {
  listeners.get(id)?.forEach((l) => l(event));
}

export function getJob(id: string): JobState | undefined {
  return jobs.get(id);
}

export function subscribe(id: string, l: Listener): () => void {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)!.add(l);
  return () => listeners.get(id)?.delete(l);
}

function newJob(total: number): JobState {
  const id = randomUUID();
  const job: JobState = { id, status: 'running', total, done: 0, items: [], logs: [] };
  jobs.set(id, job);
  return job;
}

/** Batch tai media + scrape. force=true de cao lai ca bai da co. */
export function startBatchJob(urls: string[], force = false): JobState {
  const job = newJob(urls.length);
  void (async () => {
    try {
      await runBatch(urls, {
        force,
        onProgress: (item, done) => {
          job.done = done;
          job.items.push(item);
          emit(job.id, { type: 'progress', job, item });
        },
        onLog: (url, message) => {
          const log = { url, message };
          job.logs.push(log);
          emit(job.id, { type: 'log', job, log });
        },
      });
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      await closeBrowser().catch(() => {});
      emit(job.id, { type: 'end', job });
    }
  })();
  return job;
}

/** "Lam dep video" (watermark/filter mau/crop-xoay/toc do) cho toan bo video cua danh sach bai. */
export function startBeautifyJob(
  postIds: string[],
  config: BeautifyConfig,
  watermarkImagePath?: string,
): JobState {
  const rows = getVideoMedia(postIds);
  const job = newJob(rows.length);
  void (async () => {
    try {
      const limit = pLimit(2);
      await Promise.all(
        rows.map((row) =>
          limit(async () => {
            const log = (message: string) => {
              const l = { url: row.post_id, message };
              job.logs.push(l);
              emit(job.id, { type: 'log', job, log: l });
            };
            let item: BatchItemResult;
            try {
              const postDir = path.join(DOWNLOAD_DIR, `post_${row.post_id}`);
              const relDir = path.dirname(row.file);
              const baseName = path.parse(row.file).name;
              const outRel = path
                .join(relDir, `${baseName}.beautify.mp4`)
                .split(path.sep)
                .join('/');
              log('Đang xử lý ffmpeg...');
              await beautifyVideo(
                path.join(postDir, row.file),
                path.join(postDir, outRel),
                config,
                watermarkImagePath,
              );
              setProcessedFile(row.id, outRel);
              item = { url: row.post_id, ok: true, username: row.username, file: row.file };
              log('Xong');
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              item = { url: row.post_id, ok: false, username: row.username, file: row.file, error: msg };
              log(`LỖI: ${msg}`);
            }
            job.done++;
            job.items.push(item);
            emit(job.id, { type: 'progress', job, item });
          }),
        ),
      );
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      if (watermarkImagePath) fs.rm(watermarkImagePath, { force: true }, () => {});
      emit(job.id, { type: 'end', job });
    }
  })();
  return job;
}

/** Kiem tra Live/Die nhieu proxy, co tien trinh qua SSE (khong tu luu DB - luu la hanh dong rieng). */
export function startProxyCheckJob(proxies: string[]): JobState {
  const uniq = [...new Set(proxies.map((p) => p.trim()).filter(Boolean))];
  const job = newJob(uniq.length);
  void (async () => {
    try {
      const limit = pLimit(5);
      await Promise.all(
        uniq.map((proxy) =>
          limit(async () => {
            const log = (message: string) => {
              const l = { url: proxy, message };
              job.logs.push(l);
              emit(job.id, { type: 'log', job, log: l });
            };
            log('Đang kiểm tra...');
            const result = await checkProxy(proxy);
            const item: BatchItemResult = {
              url: proxy,
              ok: result.status === 'live',
              error: result.status === 'die' ? (result.error ?? 'Die') : undefined,
              ip: result.ip,
              ms: result.ms,
            };
            job.done++;
            job.items.push(item);
            emit(job.id, { type: 'progress', job, item });
          }),
        ),
      );
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      emit(job.id, { type: 'end', job });
    }
  })();
  return job;
}

/**
 * Kiem tra tinh trang (con hang/het hang/khong ton tai) link Shopee truoc khi xuat file dang bai.
 * Dedup theo link giong nhau de khong kiem tra lap.
 * - opts.entryIds: neu truyen -> chi kiem tra cac dong duoc chon (tick chon trong bang), va CHI xet
 *   new_link (bo qua dong chua co new_link) - dung cho nut "Kiem tra da chon".
 * - khong truyen entryIds -> kiem tra TOAN BO, uu tien new_link, fallback link goc - nut "Kiem tra tat ca".
 */
export function startShopeeLinkCheckJob(opts: { entryIds?: number[] } = {}): JobState {
  const rows = getShopeeCheckTargets({ entryIds: opts.entryIds, newLinkOnly: !!opts.entryIds });
  const byTarget = new Map<string, { id: number; post_id: string }[]>();
  for (const r of rows) {
    if (!byTarget.has(r.target)) byTarget.set(r.target, []);
    byTarget.get(r.target)!.push({ id: r.id, post_id: r.post_id });
  }
  const targets = [...byTarget.keys()];
  const job = newJob(targets.length);
  void (async () => {
    try {
      // Dung trinh duyet that (Playwright) -> gioi han thap hon check qua HTTP thuan, giong cac
      // job Playwright khac (rescrape/beautify dung 2).
      const limit = pLimit(2);
      await Promise.all(
        targets.map((target) =>
          limit(async () => {
            const entries = byTarget.get(target)!;
            const log = (message: string) => {
              const l = { url: target, message };
              job.logs.push(l);
              emit(job.id, { type: 'log', job, log: l });
            };
            const result = await withRetry(() => checkShopeeLink(target, log), {
              retries: 1,
              label: `shopee-check ${target}`,
            });
            for (const e of entries) {
              setShopeeLinkStatus(e.id, result.status, result.message, result.title, result.image);
            }

            const item: BatchItemResult = {
              url: target,
              ok: result.status === 'available',
              username: entries[0]?.post_id,
              error: result.status !== 'available' ? result.message : undefined,
              shopeeStatus: result.status,
              shopeeTitle: result.title,
              shopeeImage: result.image,
            };
            job.done++;
            job.items.push(item);
            emit(job.id, { type: 'progress', job, item });
          }),
        ),
      );
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      // Dong browser rieng cua Shopee, KHONG dong browser scrape Threads dung chung o cho khac.
      await closeShopeeBrowser().catch(() => {});
      emit(job.id, { type: 'end', job });
    }
  })();
  return job;
}

/** Chi cao lai comment cho danh sach postId (nut "Lay lai comment"). */
export function startRescrapeJob(postIds: string[]): JobState {
  const job = newJob(postIds.length);
  void (async () => {
    try {
      const limit = pLimit(2);
      await Promise.all(
        postIds.map((pid) =>
          limit(async () => {
            const brief = getPostBrief(pid);
            const log = (message: string) => {
              const l = { url: pid, message };
              job.logs.push(l);
              emit(job.id, { type: 'log', job, log: l });
            };
            let item: BatchItemResult;
            if (!brief) {
              item = { url: pid, ok: false, error: 'không tìm thấy bài trong DB' };
            } else {
              const r = await rescrapeComments(brief.url, log);
              saveScrape(r.postId, r.postDate, r.entries, r.shopeeCommentCount, r.scrapeError);
              item = {
                url: brief.url,
                ok: !r.scrapeError,
                username: brief.username,
                caption: brief.caption,
                entries: r.entries.length,
                scrapeError: r.scrapeError,
              };
            }
            job.done++;
            job.items.push(item);
            emit(job.id, { type: 'progress', job, item });
          }),
        ),
      );
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      await closeBrowser().catch(() => {});
      emit(job.id, { type: 'end', job });
    }
  })();
  return job;
}
