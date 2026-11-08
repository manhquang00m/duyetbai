import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import { runBatch, type BatchItemResult } from './batch';
import { refetchMedia, rescrapeComments } from './pipeline';
import { closeBrowser, closeShopeeBrowser } from './browser';
import { beautifyVideo, type BeautifyConfig } from './beautify';
import { checkProxy } from './proxyCheck';
import { saveProxies } from '../db/proxies';
import {
  getPostBrief,
  getVideoMedia,
  getShopeeCheckTargets,
  classifyPosts,
  REJECT_REASONS,
  type RejectReason,
  type ShopeeCheckTarget,
} from '../db/queries';
import { saveScrape, setProcessedFile, setShopeeLinkStatus } from '../db/repository';
import { checkShopeeLink } from './shopeeLinkCheck';
import { checkAccount, openViewer, type Viewer } from './shadowbanCheck';
import { listRows, rewriteRow } from './rewrite';
import { listMissingPostIds, generateVariantsForPost, VARIANT_COUNT } from './postCaptionVariants';
import { setPostTopic } from '../db/accountTopics';
import { withRetry } from '../utils/retry';
import { DOWNLOAD_DIR, LLM_CONCURRENCY } from '../config';

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
  // 1 bai (post_id) bi 2 URL KHAC NHAU trong chinh lan chay nay gan cho 2 chu de khac nhau (vd
  // 2 share-link trung nhau lai nam o 2 nhom chu de khac nhau) - hiem gap, chi de canh bao.
  topicConflicts?: { postId: string; topics: string[] }[];
  /** Job cao co bat luong tu dong -> id job pipeline chay tiep ngay sau (client mo SSE tiep). */
  nextJobId?: string;
  /** Job pipeline: tien trinh tung chang (status 'skipped' = nguoi dung tat chang do). */
  phases?: PipelinePhase[];
  summary?: PipelineSummary;
}

export interface PipelinePhase {
  key: 'check' | 'rewrite';
  label: string;
  total: number;
  done: number;
  status: 'pending' | 'running' | 'done' | 'skipped';
}

export interface PipelineOptions {
  checkLinks: boolean;
  rewrite: boolean;
}

export interface PipelineSummary {
  total: number;
  pass: number; // co link, moi link con hang
  rewritten: number;
  rewriteFailed: number;
  reject: Record<RejectReason, number>;
  rejectIds: string[]; // bai bi loai - nut "Xoa N bai bi loai" (server van tinh lai khi xoa)
  scrapeErrorIds: string[]; // cao comment loi -> khong loai, goi y "Lay lai comment"
  unchecked: number; // con link chua kiem tra (tat chang kiem tra)
  posted: number; // da dang tu truoc -> khong dong vao
  needNewLink: number; // bai dat con link chua co new_link (buoc Cap nhat thu cong tiep theo)
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

/** Ghi 1 dong log vao job + day qua SSE. */
function logTo(job: JobState): (url: string, message: string) => void {
  return (url, message) => {
    const l = { url, message };
    job.logs.push(l);
    emit(job.id, { type: 'log', job, log: l });
  };
}

function newJob(total: number): JobState {
  const id = randomUUID();
  const job: JobState = { id, status: 'running', total, done: 0, items: [], logs: [] };
  jobs.set(id, job);
  return job;
}

/**
 * Batch tai media + scrape. force=true de cao lai ca bai da co.
 * urlTopics (url -> chu de): gan chu de THANG vao DUNG bai (post_id) do url do cao ra ngay khi
 * thanh cong (ke ca item.skipped vi da tai roi - van biet duoc postId qua batch.ts). Moi bai la
 * 1 dong rieng nen KHONG the co tranh chap: du 1 tac gia xuat hien o nhieu nhom chu de trong CUNG
 * 1 lan chay, moi bai cua ho van chi nhan DUNG chu de cua nhom no thuoc ve.
 */
export function startBatchJob(
  urls: string[],
  force = false,
  urlTopics?: Record<string, string>,
  pipeline?: PipelineOptions,
): JobState {
  const job = newJob(urls.length);
  // Hiem gap: 2 URL KHAC NHAU trong chinh lan chay nay lai tro ve CUNG 1 post_id (vd 2 share-link
  // trung bai) nhung nam o 2 nhom chu de khac nhau - theo doi de canh bao sau khi xong.
  const appliedThisRun = new Map<string, Set<string>>();
  void (async () => {
    try {
      await runBatch(urls, {
        force,
        onProgress: (item, done) => {
          job.done = done;
          job.items.push(item);
          const topic = urlTopics?.[item.url];
          if (item.ok && item.postId && topic) {
            setPostTopic(item.postId, topic);
            if (!appliedThisRun.has(item.postId)) appliedThisRun.set(item.postId, new Set());
            appliedThisRun.get(item.postId)!.add(topic);
          }
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
      const conflicts = [...appliedThisRun.entries()]
        .filter(([, topics]) => topics.size > 1)
        .map(([postId, topics]) => ({ postId, topics: [...topics] }));
      if (conflicts.length > 0) job.topicConflicts = conflicts;
      await closeBrowser().catch(() => {});
      // Luong tu dong: chi bai MOI cua lan cao nay (bai da co tu truoc -> skipped, khong dong vao).
      // Chay sau closeBrowser (tuan tu, khong tranh browser) va gan nextJobId TRUOC khi bao 'end'.
      if (pipeline && (pipeline.checkLinks || pipeline.rewrite) && job.status === 'done') {
        const fresh = [
          ...new Set(job.items.filter((i) => i.ok && !i.skipped && i.postId).map((i) => i.postId!)),
        ];
        if (fresh.length > 0) job.nextJobId = startPostPipelineJob(fresh, pipeline).id;
      }
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

/**
 * Check shadowban nhieu nick, TUAN TU (1 nick viewer dung chung, va mo qua nhieu trang Threads
 * cung luc tu 1 proxy de bi chan). Ket qua tung nick tu luu DB trong checkAccount.
 */
export function startShadowbanCheckJob(accountNames: string[]): JobState {
  const uniq = [...new Set(accountNames.map((n) => n.trim()).filter(Boolean))];
  const job = newJob(uniq.length);
  void (async () => {
    const jobLog = (url: string, message: string) => {
      const l = { url, message };
      job.logs.push(l);
      emit(job.id, { type: 'log', job, log: l });
    };
    let viewer: Viewer | null = null;
    try {
      try {
        viewer = await openViewer((m) => jobLog('viewer', m));
      } catch (err) {
        // GPM tat / sai profile id -> van check duoc bang cach khong dang nhap, chi thieu buoc search.
        jobLog('viewer', `Không mở được nick viewer (${err instanceof Error ? err.message : String(err)}) -> bỏ qua bước search`);
        viewer = { page: null, close: async () => {} };
      }
      for (const name of uniq) {
        let item: BatchItemResult;
        try {
          const r = await checkAccount(name, viewer, (m) => jobLog(name, m));
          item = {
            url: name,
            ok: r.verdict === 'ok',
            shadowban: {
              verdict: r.verdict,
              recentMedian: r.recentMedian,
              baselineMedian: r.baselineMedian,
              hiddenPosts: r.hiddenPosts,
              searchVisible: r.searchVisible,
              reasons: r.reasons,
            },
          };
        } catch (err) {
          item = { url: name, ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        job.done++;
        job.items.push(item);
        emit(job.id, { type: 'progress', job, item });
      }
      job.status = 'done';
    } catch (err) {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : String(err);
    } finally {
      await viewer?.close().catch(() => {});
      await closeBrowser().catch(() => {});
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
            // Luu thang vao kho proxy: truoc day job chi bao ket qua len UI, nguoi dung phai bam
            // "Luu tat ca" thi moi vao DB - dong popup giua chung la mat sach ket qua vua cho.
            saveProxies([{ proxy, status: result.status, ip: result.ip }]);
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
 * Luon kiem tra LINK GOC (xem getShopeeCheckTargets).
 * - opts.entryIds: chi kiem tra cac dong duoc tick chon trong bang - nut "Kiem tra da chon".
 * - opts.postIds: chi kiem tra link cua cac bai da chon - nut "Kiem tra link Shopee" o trang Bai viet.
 * - khong truyen gi -> kiem tra TOAN BO - nut "Kiem tra tat ca".
 */
export function startShopeeLinkCheckJob(
  opts: { entryIds?: number[]; postIds?: string[] } = {},
): JobState {
  const byTarget = groupCheckTargets(
    getShopeeCheckTargets({ entryIds: opts.entryIds, postIds: opts.postIds }),
  );
  const job = newJob(byTarget.size);
  void (async () => {
    try {
      await runShopeeLinkChecks(byTarget, logTo(job), (item) => {
        job.done++;
        job.items.push(item);
        emit(job.id, { type: 'progress', job, item });
      });
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

/** Gom dong theo link (dedup): 1 link kiem tra 1 lan, ghi ket qua cho moi dong trung link. */
function groupCheckTargets(rows: ShopeeCheckTarget[]): Map<string, { id: number; post_id: string }[]> {
  const byTarget = new Map<string, { id: number; post_id: string }[]>();
  for (const r of rows) {
    if (!byTarget.has(r.target)) byTarget.set(r.target, []);
    byTarget.get(r.target)!.push({ id: r.id, post_id: r.post_id });
  }
  return byTarget;
}

/** Loi kiem tra link dung chung cho job kiem tra rieng va pipeline. Nguoi goi tu dong browser Shopee. */
async function runShopeeLinkChecks(
  byTarget: Map<string, { id: number; post_id: string }[]>,
  log: (url: string, message: string) => void,
  onItem: (item: BatchItemResult) => void,
): Promise<void> {
  // Dung trinh duyet that (Playwright) -> gioi han thap hon check qua HTTP thuan, giong cac
  // job Playwright khac (rescrape/beautify dung 2).
  const limit = pLimit(2);
  await Promise.all(
    [...byTarget.entries()].map(([target, entries]) =>
      limit(async () => {
        const result = await withRetry(() => checkShopeeLink(target, (m) => log(target, m)), {
          retries: 1,
          label: `shopee-check ${target}`,
        });
        for (const e of entries) {
          setShopeeLinkStatus(e.id, result.status, result.message, result.title, result.image);
        }
        onItem({
          url: target,
          ok: result.status === 'available',
          username: entries[0]?.post_id,
          error: result.status !== 'available' ? result.message : undefined,
          shopeeStatus: result.status,
          shopeeTitle: result.title,
          shopeeImage: result.image,
        });
      }),
    ),
  );
}

/** Viet lai caption bang AI cho toan bo dong cua 1 batch (trang "Viet lai caption"). */
export function startRewriteJob(batchId: string): JobState {
  const rows = listRows(batchId);
  const job = newJob(rows.length);
  void (async () => {
    try {
      const limit = pLimit(LLM_CONCURRENCY);
      await Promise.all(
        rows.map((row) =>
          limit(async () => {
            const label = `Dòng ${row.row_index}`;
            const r = await rewriteRow(row.id);
            const item: BatchItemResult = r.ok
              ? { url: label, ok: true, caption: r.text }
              : { url: label, ok: false, error: r.error };
            const l = { url: label, message: r.ok ? 'Đã viết lại' : `LỖI: ${r.error}` };
            job.logs.push(l);
            emit(job.id, { type: 'log', job, log: l });
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
 * Viet lai VARIANT_COUNT ban caption cho tung bai trong danh sach (mac dinh: bai chua du ban trong
 * kho phan phoi). Dung cho the "Viet lai caption kho bai" o trang Phan phoi bai.
 */
export function startCaptionVariantJob(postIds?: string[]): JobState {
  const ids = postIds && postIds.length > 0 ? postIds : listMissingPostIds();
  const job = newJob(ids.length);
  void (async () => {
    try {
      await runCaptionVariants(ids, true, logTo(job), (item) => {
        job.done++;
        job.items.push(item);
        emit(job.id, { type: 'progress', job, item });
      });
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

/** Loi viet lai caption dung chung cho job rieng va pipeline. force=false: bo qua bai da du ban. */
async function runCaptionVariants(
  ids: string[],
  force: boolean,
  log: (url: string, message: string) => void,
  onItem: (item: BatchItemResult) => void,
): Promise<void> {
  const limit = pLimit(LLM_CONCURRENCY);
  await Promise.all(
    ids.map((postId) =>
      limit(async () => {
        const r = await generateVariantsForPost(postId, force);
        log(postId, r.ok ? 'Đã viết lại' : `LỖI: ${r.error}`);
        onItem(r.ok ? { url: postId, ok: true, postId } : { url: postId, ok: false, postId, error: r.error });
      }),
    ),
  );
}

/**
 * Luong tu dong cho danh sach bai (sau khi cao, hoac "Xu ly kho"), TUAN TU tung chang:
 *   1. Kiem tra link Shopee chua kiem tra
 *   2. Phan loai: dat / bi loai (khong link, chet, het hang, can xem lai) / cao loi / da dang
 *   3. Viet lai caption cho bai DAT chua du ban (bai bi loai khong ton luot AI)
 * KHONG tu xoa: tra summary de nguoi dung bam 1 nut xoa (POST /api/posts/delete-rejected).
 */
export function startPostPipelineJob(postIds: string[], opts: PipelineOptions): JobState {
  const ids = [...new Set(postIds)];
  // ids rong -> getShopeeCheckTargets hieu la "khong loc" = kiem tra ca kho -> chan truoc
  const byTarget =
    opts.checkLinks && ids.length > 0
      ? groupCheckTargets(getShopeeCheckTargets({ postIds: ids, uncheckedOnly: true }))
      : new Map<string, { id: number; post_id: string }[]>();
  const job = newJob(ids.length);
  const check: PipelinePhase = {
    key: 'check',
    label: 'Kiểm tra link',
    total: byTarget.size,
    done: 0,
    status: opts.checkLinks ? 'pending' : 'skipped',
  };
  const rewrite: PipelinePhase = {
    key: 'rewrite',
    label: 'Viết lại caption',
    total: 0,
    done: 0,
    status: opts.rewrite ? 'pending' : 'skipped',
  };
  job.phases = [check, rewrite];
  const log = logTo(job);
  const progress = (item?: BatchItemResult) => {
    if (item) job.items.push(item);
    emit(job.id, { type: 'progress', job, item });
  };

  void (async () => {
    let rewritten = 0;
    let rewriteFailed = 0;
    try {
      if (check.status === 'pending') {
        check.status = 'running';
        progress();
        try {
          await runShopeeLinkChecks(byTarget, log, (item) => {
            check.done++;
            progress(item);
          });
        } finally {
          await closeShopeeBrowser().catch(() => {});
        }
        check.status = 'done';
      }

      const verdicts = classifyPosts(ids);
      if (rewrite.status === 'pending') {
        const todo = verdicts
          .filter((v) => v.verdict === 'pass' && v.variant_count < VARIANT_COUNT)
          .map((v) => v.post_id);
        rewrite.total = todo.length;
        rewrite.status = 'running';
        progress();
        await runCaptionVariants(todo, false, log, (item) => {
          rewrite.done++;
          if (item.ok) rewritten++;
          else rewriteFailed++;
          progress(item);
        });
        rewrite.status = 'done';
      }

      const reject = Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>;
      const rejectIds: string[] = [];
      for (const v of verdicts) {
        if ((REJECT_REASONS as readonly string[]).includes(v.verdict)) {
          reject[v.verdict as RejectReason]++;
          rejectIds.push(v.post_id);
        }
      }
      const pass = verdicts.filter((v) => v.verdict === 'pass');
      job.summary = {
        total: ids.length,
        pass: pass.length,
        rewritten,
        rewriteFailed,
        reject,
        rejectIds,
        scrapeErrorIds: verdicts.filter((v) => v.verdict === 'scrapeError').map((v) => v.post_id),
        unchecked: verdicts.filter((v) => v.verdict === 'unchecked').length,
        posted: verdicts.filter((v) => v.verdict === 'posted').length,
        needNewLink: pass.filter((v) => v.need_new_link).length,
      };
      job.done = job.total;
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

/**
 * Crawl lai RIENG media cho danh sach postId (nut "Crawl lai media" o trang Bai viet).
 * item.ok = da thay bang bo media tot hon; skipped = crawl xong nhung khong tot hon -> giu ban cu.
 */
export function startRefetchMediaJob(postIds: string[]): JobState {
  const job = newJob(postIds.length);
  void (async () => {
    try {
      // Goi savethreads/snapsave + tai file nang -> gioi han 2 bai song song nhu cac job cao khac
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
              item = { url: pid, ok: false, postId: pid, error: 'không tìm thấy bài trong DB' };
            } else {
              try {
                const r = await withRetry(() => refetchMedia(pid, brief.url, log), {
                  retries: 1,
                  label: `refetch-media ${pid}`,
                });
                item = {
                  url: brief.url,
                  postId: pid,
                  ok: r.replaced,
                  skipped: !r.replaced,
                  username: brief.username,
                  mediaOk: r.after.video + r.after.image,
                  mediaFail: r.mediaFail,
                  mediaBefore: r.before,
                  mediaAfter: r.after,
                };
              } catch (err) {
                const msg = (err instanceof Error ? err.message : String(err)).split('\n')[0];
                log(`LỖI: ${msg}`);
                item = { url: brief.url, postId: pid, ok: false, username: brief.username, error: msg };
              }
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
      emit(job.id, { type: 'end', job });
    }
  })();
  return job;
}
