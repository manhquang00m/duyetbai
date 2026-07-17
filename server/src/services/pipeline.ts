import { getPostMedia, type PostStats } from './mediaSource';
import { getSellerShopeeEntries, type SellerEntry } from './comments';
import { downloadPost, type DownloadedFile } from './downloader';
import { withRetry } from '../utils/retry';
import { extractShortcode } from '../utils/postId';
import { DOWNLOAD_DIR } from '../config';

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
  const postId = extractShortcode(url);
  try {
    log?.('Scrape comment...');
    const scrape = await withRetry(() => getSellerShopeeEntries(url), {
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
