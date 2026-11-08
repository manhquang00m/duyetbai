import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { getPostMedia, getPostMediaBest, type PostStats } from './mediaSource';
import { getSellerShopeeEntries, resolveThreadsUrl, type SellerEntry } from './comments';
import { downloadPost, type DownloadedFile } from './downloader';
import { withRetry } from '../utils/retry';
import { extractShortcode } from '../utils/postId';
import { DOWNLOAD_DIR } from '../config';
import { countOkMedia, replaceMedia } from '../db/repository';

export type LogFn = (message: string) => void;

export interface InfoRow {
  user: string;
  date: string; // ngay dang
  comment: string;
  link: string;
  likes: string; // so tim
  comments: string; // so comment
  views: string; // so view
}

// Thu tu cot phai khop header
export const INFO_HEADER = 'user|ngay_dang|comment|link_shopee|so_tim|so_comment|so_view';

export function infoRowToLine(r: InfoRow): string {
  return [r.user, r.date, r.comment, r.link, r.likes, r.comments, r.views].join('|');
}

/**
 * Gop savethreads (user + stats) va scrape (ngay + comment + link shopee)
 * thanh cac dong info cho 1 bai. (Dung cho test comment, KHONG tai media.)
 */
export async function collectPostInfo(url: string): Promise<InfoRow[]> {
  const media = await getPostMedia(url);
  const { postDate, entries } = await getSellerShopeeEntries(url);

  return entries.map((e) => ({
    user: media.username,
    date: postDate,
    comment: e.comment,
    link: e.link,
    likes: media.stats.likes,
    comments: media.stats.comments,
    views: media.stats.views,
  }));
}

/** Ket qua day du 1 bai: metadata + file da tai + link shopee. */
export interface PostResult {
  url: string;
  postId: string;
  username: string;
  title?: string;
  caption: string;
  stats: PostStats;
  postDate: string;
  files: DownloadedFile[];
  entries: SellerEntry[];
  shopeeCommentCount: number; // so comment (chu bai) co link shopee
  scrapeError?: string; // neu scrape comment that bai (media van luu)
}

/**
 * Pipeline day du cho 1 bai (dung o batch/Step 5):
 *   1) lay metadata + media  2) tai media NGAY (token het han)  3) scrape comment.
 *
 * Scrape comment la BEST-EFFORT: neu that bai (proxy/timeout) van tra ket qua
 * voi media + stats de post duoc luu DB, kem scrapeError de biet bai can cao lai.
 */
export async function processPost(url: string, log?: LogFn): Promise<PostResult> {
  const media = await getPostMedia(url, log);
  log?.(`Tải ${media.media.length} media...`);
  const download = await downloadPost(media, DOWNLOAD_DIR);
  const mediaFail = download.files.filter((f) => !f.ok).length;
  log?.(mediaFail ? `${mediaFail}/${download.files.length} media tải LỖI` : 'Tải media xong');

  let postDate = '';
  let entries: SellerEntry[] = [];
  let shopeeCommentCount = 0;
  let scrapeError: string | undefined;
  try {
    log?.('Scrape comment (Playwright)...');
    const scrape = await withRetry(() => getSellerShopeeEntries(url), {
      retries: 2,
      label: `scrape ${url}`,
    });
    postDate = scrape.postDate;
    entries = scrape.entries;
    shopeeCommentCount = scrape.shopeeCommentCount;
    log?.(`${shopeeCommentCount} comment có link shopee`);
  } catch (err) {
    // Khong lam chet ca bai - media da tai xong van dang gia tri.
    scrapeError = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    log?.(`Scrape LỖI: ${scrapeError}`);
  }

  return {
    url,
    postId: media.postId,
    username: media.username,
    title: media.title,
    caption: media.caption,
    stats: media.stats,
    postDate,
    files: download.files,
    entries,
    shopeeCommentCount,
    scrapeError,
  };
}

export interface RescrapeResult {
  postId: string;
  postDate: string;
  entries: SellerEntry[];
  shopeeCommentCount: number;
  scrapeError?: string;
}

/** Chi cao lai comment (khong tai media) - dung cho nut "Lay lai comment". */
export async function rescrapeComments(url: string, log?: LogFn): Promise<RescrapeResult> {
  const resolvedUrl = await resolveThreadsUrl(url);
  const postId = extractShortcode(resolvedUrl);
  try {
    log?.('Scrape comment...');
    const scrape = await withRetry(() => getSellerShopeeEntries(resolvedUrl), {
      retries: 2,
      label: `rescrape ${url}`,
    });
    log?.(`${scrape.shopeeCommentCount} comment có link shopee`);
    return {
      postId,
      postDate: scrape.postDate,
      entries: scrape.entries,
      shopeeCommentCount: scrape.shopeeCommentCount,
    };
  } catch (err) {
    const scrapeError = (err instanceof Error ? err.message : String(err)).split('\n')[0];
    log?.(`Lỗi: ${scrapeError}`);
    return { postId, postDate: '', entries: [], shopeeCommentCount: 0, scrapeError };
  }
}

export interface RefetchMediaResult {
  replaced: boolean; // true = da thay bang bo media moi
  before: { video: number; image: number }; // so file tai duoc truoc khi crawl lai
  after: { video: number; image: number }; // so file tai duoc cua lan crawl nay
  mediaFail: number; // so file lan nay tai loi
}

const MEDIA_SUBDIRS = ['videos', 'img'] as const; // khop SUBDIR trong downloader.ts

const exists = (p: string) => stat(p).then(() => true, () => false);

/**
 * Crawl lai RIENG media cho 1 bai da co trong DB (nut "Crawl lai media"). Khong dong toi caption,
 * comment, link Shopee, chu de.
 *
 * An toan voi file dang tot: tai vao thu muc TAM truoc, chi thay khi lan nay tai duoc nhieu file
 * hon VA khong it hon o bat ky loai nao (video/anh) - neu khong thi giu nguyen media cu. Doi thu
 * muc bang rename, loi giua chung thi tra lai thu muc cu.
 */
export async function refetchMedia(postId: string, url: string, log?: LogFn): Promise<RefetchMediaResult> {
  // postId lay tu DB nhung van dung de dung duong dan -> chot dinh dang + kiem tra nam trong DOWNLOAD_DIR
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(postId)) throw new Error('postId không hợp lệ');
  const base = path.resolve(DOWNLOAD_DIR);
  const postDir = path.resolve(base, `post_${postId}`);
  if (path.dirname(postDir) !== base) throw new Error('Đường dẫn bài không hợp lệ');

  const before = countOkMedia(postId);
  const media = await getPostMediaBest(url, log);
  if (media.postId !== postId) {
    throw new Error(`Link trả về bài khác (${media.postId}) — không ghi đè`);
  }

  const tmpBase = path.join(base, '_refetch', randomUUID());
  try {
    log?.(`Tải ${media.media.length} media vào thư mục tạm...`);
    const dl = await downloadPost(media, tmpBase, (f, done, total) =>
      log?.(`Tải ${done}/${total}: ${f.type === 'video' ? 'video' : 'ảnh'} ${f.ok ? 'OK' : `LỖI (${(f.error ?? '').split('\n')[0]})`}`),
    );
    const after = { video: 0, image: 0 };
    for (const f of dl.files) if (f.ok) after[f.type]++;
    const mediaFail = dl.files.filter((f) => !f.ok).length;

    const better =
      after.video + after.image > before.video + before.image &&
      after.video >= before.video &&
      after.image >= before.image;
    if (!better) {
      log?.(`Không tốt hơn bản cũ (cũ ${before.video} video/${before.image} ảnh, mới ${after.video}/${after.image}) — giữ nguyên`);
      return { replaced: false, before, after, mediaFail };
    }

    // Doi thu muc: cu -> tmp/_old, moi -> postDir. Loi giua chung -> tra lai cu.
    await mkdir(postDir, { recursive: true });
    const oldDir = path.join(tmpBase, '_old');
    await mkdir(oldDir, { recursive: true });
    const moved: { from: string; to: string }[] = [];
    try {
      for (const sub of MEDIA_SUBDIRS) {
        const cur = path.join(postDir, sub);
        if (await exists(cur)) {
          await rename(cur, path.join(oldDir, sub));
          moved.push({ from: cur, to: path.join(oldDir, sub) });
        }
      }
      for (const sub of MEDIA_SUBDIRS) {
        const fresh = path.join(dl.dir, sub);
        if (await exists(fresh)) {
          await rename(fresh, path.join(postDir, sub));
          moved.push({ from: fresh, to: path.join(postDir, sub) });
        }
      }
      replaceMedia(
        postId,
        dl.files.map((f) => ({ type: f.type, file: f.file, ok: f.ok, error: f.error })),
      );
    } catch (err) {
      for (const m of moved.reverse()) await rename(m.to, m.from).catch(() => {});
      throw new Error(
        `Không thay được media (file có thể đang mở ở chỗ khác): ${(err instanceof Error ? err.message : String(err)).split('\n')[0]}`,
      );
    }
    log?.(`Đã thay: ${before.video} video/${before.image} ảnh → ${after.video} video/${after.image} ảnh`);
    return { replaced: true, before, after, mediaFail };
  } finally {
    await rm(tmpBase, { recursive: true, force: true }).catch(() => {});
  }
}
