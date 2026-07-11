import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import { runBatch, type BatchItemResult } from './batch';
import { rescrapeComments } from './pipeline';
import { closeBrowser } from './browser';
import { beautifyVideo, type BeautifyConfig } from './beautify';
import { getPostBrief, getVideoMedia } from '../db/queries';
import { saveScrape, setProcessedFile } from '../db/repository';
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
