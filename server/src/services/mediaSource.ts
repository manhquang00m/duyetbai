import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { extractShortcode, extractAuthor } from '../utils/postId';
import { getProxyAgent } from '../utils/httpAgent';
import { getSetting } from '../db/settings';

/**
 * ===== Interface chung (KHONG doi khi doi nguon media) =====
 * Step 3 (download) va Step 5 (orchestration) chi biet ham getPostMedia(),
 * khong quan tam ben trong goi savethreads/snapsave hay parse Playwright.
 */
export interface MediaItem {
  type: 'video' | 'image';
  url: string; // link CDN tai truc tiep (GET); voi nguon can POST kem session (vd snapsave) chi la nhan, xem download()
  ext?: string; // 'mp4', 'jpg' ... dung de dat ten file o Step 3
  // Neu co: Step 3 goi ham nay de lay thang bytes (bo qua GET url o tren) - dung cho nguon
  // ma viec tai file thuc su can POST kem cookie/token phien rieng (vd snapsave.vn).
  download?: () => Promise<Buffer>;
}

export interface PostStats {
  likes: string; // giu string vi savethreads tra "26.6K"
  comments: string;
  views: string;
}

export interface PostMedia {
  postId: string; // shortcode, dung dat ten folder
  username: string; // chu bai
  title?: string;
  caption: string;
  stats: PostStats;
  media: MediaItem[];
}

/**
 * ===== Implementation: savethreads.io =====
 */
const BASE_URL = 'https://savethreads.io';
const PROXY_URL = `${BASE_URL}/proxy.php`;

// User-Agent giong trinh duyet that -> endpoint chap nhan request
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

// Zod: chi validate thu ta thuc su dung, phan thua bo qua.
const MediaItemSchema = z.object({
  type: z.string(), // "Video" | "Image"
  mediaUrl: z.string().url(),
  mediaExtension: z.string().optional(),
});

const ResponseSchema = z.object({
  api: z.object({
    status: z.string(),
    message: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    userInfo: z.object({ username: z.string().optional() }).optional(),
    mediaStats: z
      .object({
        likesCount: z.string().optional(),
        commentsCount: z.string().optional(),
        viewsCount: z.string().optional(),
      })
      .optional(),
    // savethreads doi khi tra "mediaItems": false (bai khong co media) thay vi mang rong
    // -> ep ve [] truoc khi validate, tranh loi zod cung (Expected array, received boolean).
    mediaItems: z.preprocess(
      (v) => (Array.isArray(v) ? v : []),
      z.array(MediaItemSchema),
    ),
  }),
});

// Cache PHPSESSID trong vong doi process (xin 1 lan, dung lai nhieu request).
let cachedCookie: string | null = null;

function makeClient(): AxiosInstance {
  const agent = getProxyAgent();
  return axios.create({
    timeout: 30_000,
    headers: { 'user-agent': USER_AGENT },
    // Neu co proxy: dung agent cho ca http/https, tat proxy mac dinh cua axios.
    ...(agent ? { httpAgent: agent, httpsAgent: agent, proxy: false as const } : {}),
  });
}

/**
 * Tu ghe trang chu de xin PHPSESSID moi (KHONG hardcode cookie cua ai).
 * Neu khong lay duoc thi tra chuoi rong -> van thu POST (co the endpoint van chap nhan).
 */
async function getSessionCookie(client: AxiosInstance): Promise<string> {
  if (cachedCookie !== null) return cachedCookie;

  try {
    const res = await client.get(`${BASE_URL}/en`, { headers: { accept: 'text/html' } });
    const setCookie = (res.headers['set-cookie'] as string[] | undefined) ?? [];
    const phpsessid = setCookie
      .map((c) => c.split(';')[0]) // bo phan "; path=/; HttpOnly..."
      .find((c) => c.startsWith('PHPSESSID='));
    cachedCookie = phpsessid ?? '';
  } catch {
    cachedCookie = '';
  }
  return cachedCookie;
}

// savethreads.io gioi han rate (429) neu goi qua nhanh/qua nhieu request cung luc tu 1 IP -
// serialize + gian cach toi thieu giua cac lan goi, doc lap voi CONCURRENCY chung cua batch
// (batch co the tai media/scrape comment song song binh thuong, chi rieng buoc goi savethreads
// nay la bi thac co).
const MIN_INTERVAL_MS = 2500;
let chain: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  chain = run.catch(() => {}); // 1 request loi khong duoc lam ket hang doi cac request sau
  return run;
}

/**
 * Nhan 1 URL bai Threads -> tra media + caption, qua savethreads.io.
 * Luu y: URL media tra ve co token het han -> tai ngay o Step 3.
 */
async function fetchViaSaveThreads(url: string): Promise<PostMedia> {
  return throttled(async () => {
    const client = makeClient();
    const cookie = await getSessionCookie(client);

    // Bo cac query param theo doi (?xmt=...&slof=1...) truoc khi goi savethreads - chi gui
    // dung URL bai o dang chuan, tranh truong hop scraper cua ho bi vuong tham so thua.
    const cleanUrl = `https://www.threads.com/@${extractAuthor(url)}/post/${extractShortcode(url)}`;

    const res = await client.post(PROXY_URL, new URLSearchParams({ url: cleanUrl }).toString(), {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        origin: BASE_URL,
        referer: `${BASE_URL}/en`,
        'x-requested-with': 'XMLHttpRequest',
        ...(cookie ? { cookie } : {}),
      },
    });

    const parsed = ResponseSchema.safeParse(res.data);
    if (!parsed.success) {
      throw new Error(`Response savethreads khong dung dinh dang mong doi: ${parsed.error.message}`);
    }

    const api = parsed.data.api;
    if (api.status !== 'ok') {
      throw new Error(`savethreads tra status="${api.status}" (${api.message ?? 'khong ro ly do'})`);
    }
    if (api.mediaItems.length === 0) {
      throw new Error('Khong lay duoc media (bai co the bi an, da xoa, hoac can dang nhap).');
    }

    const media: MediaItem[] = api.mediaItems.map((item) => ({
      type: item.type.toLowerCase() === 'video' ? 'video' : 'image',
      url: item.mediaUrl,
      ext: item.mediaExtension?.toLowerCase(),
    }));

    return {
      postId: extractShortcode(url),
      username: api.userInfo?.username ?? '',
      title: api.title,
      caption: api.description ?? '',
      stats: {
        likes: api.mediaStats?.likesCount ?? '',
        comments: api.mediaStats?.commentsCount ?? '',
        views: api.mediaStats?.viewsCount ?? '',
      },
      media,
    };
  });
}

/**
 * ===== Implementation: snapsave.vn (nguon du phong khi savethreads loi/rate-limit) =====
 * Khac savethreads (tra thang link CDN): snapsave can dang nhap session (cookie Laravel +
 * CSRF token) roi POST /media-download moi ra duoc bytes file that. Vi token/cookie het han
 * nhanh, moi lan goi tu lam session rieng, KHONG cache dung chung nhu savethreads.
 */
const SNAPSAVE_BASE = 'https://snapsave.vn';

const SNAPSAVE_MIN_INTERVAL_MS = 2500;
let snapsaveChain: Promise<unknown> = Promise.resolve();
let snapsaveLastCallAt = 0;

function snapsaveThrottled<T>(fn: () => Promise<T>): Promise<T> {
  const run = snapsaveChain.then(async () => {
    const wait = snapsaveLastCallAt + SNAPSAVE_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    snapsaveLastCallAt = Date.now();
    return fn();
  });
  snapsaveChain = run.catch(() => {});
  return run;
}

interface SnapsaveSession {
  cookie: string;
  xsrfToken?: string;
  token: string; // _token form field (CSRF, lay tu trang chu)
}

async function bootstrapSnapsaveSession(client: AxiosInstance): Promise<SnapsaveSession> {
  const res = await client.get(`${SNAPSAVE_BASE}/`, { headers: { accept: 'text/html' } });
  const setCookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  const jar: Record<string, string> = {};
  for (const c of setCookies) {
    const pair = c.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > 0) jar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  const cookie = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
  const xsrfToken = jar['XSRF-TOKEN'] ? decodeURIComponent(jar['XSRF-TOKEN']) : undefined;
  const html = typeof res.data === 'string' ? res.data : '';
  const token = html.match(/name="_token"[^>]*value="([^"]+)"/i)?.[1];
  if (!token) throw new Error('snapsave: khong lay duoc _token tu trang chu');
  return { cookie, xsrfToken, token };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchViaSnapsave(url: string): Promise<PostMedia> {
  return snapsaveThrottled(async () => {
    const agent = getProxyAgent();
    const client = axios.create({
      timeout: 30_000,
      headers: { 'user-agent': USER_AGENT },
      ...(agent ? { httpAgent: agent, httpsAgent: agent, proxy: false as const } : {}),
    });
    const session = await bootstrapSnapsaveSession(client);

    const cleanUrl = `https://www.threads.com/@${extractAuthor(url)}/post/${extractShortcode(url)}`;
    const res = await client.post(
      `${SNAPSAVE_BASE}/fetch`,
      new URLSearchParams({ _token: session.token, platform: 'threads', url: cleanUrl }).toString(),
      {
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json, text/javascript, */*; q=0.01',
          origin: SNAPSAVE_BASE,
          referer: `${SNAPSAVE_BASE}/`,
          'x-requested-with': 'XMLHttpRequest',
          ...(session.xsrfToken ? { 'x-xsrf-token': session.xsrfToken } : {}),
          cookie: session.cookie,
        },
      },
    );

    const body = res.data as { status?: boolean; message?: string; data?: string } | undefined;
    if (!body?.status) {
      throw new Error(`snapsave tra loi: ${body?.message || 'khong ro ly do'}`);
    }
    const html = body.data ?? '';
    if (!html) {
      throw new Error('snapsave: khong co noi dung tra ve (bai co the rieng tu/da xoa).');
    }

    const captionMatch = html.match(/<div class="markdown[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const caption = captionMatch ? stripHtml(captionMatch[1]) : '';

    // Moi khoi <form action=".../media-download">...</form> ung voi 1 media (video/anh),
    // ben trong co _token/username rieng + <select name="url"><option value="ma-hoa">...
    // + nut bam mang data-ftype="video"|"photo". Lay option DAU TIEN (chat luong mac dinh).
    const formRe = /<form[^>]*action="([^"]*media-download[^"]*)"[^>]*>([\s\S]*?)<\/form>/gi;
    const media: MediaItem[] = [];
    let fm: RegExpExecArray | null;
    let idx = 0;
    while ((fm = formRe.exec(html))) {
      const action = fm[1];
      const formBody = fm[2];
      const itemToken = formBody.match(/name="_token"[^>]*value="([^"]*)"/i)?.[1];
      const username = formBody.match(/name="username"[^>]*value="([^"]*)"/i)?.[1];
      const optionValue = formBody.match(/<option value="([^"]+)"/i)?.[1];
      const ftype = formBody.match(/data-ftype="([^"]+)"/i)?.[1];
      if (!itemToken || !optionValue || !ftype) continue; // thieu du lieu can thiet -> bo qua item nay

      const type: MediaItem['type'] = ftype === 'photo' ? 'image' : 'video';
      const itemIndex = idx++;
      media.push({
        type,
        url: `snapsave:${itemIndex}`, // chi de nhan biet/log, khong phai link tai truc tiep
        ext: type === 'video' ? 'mp4' : 'jpg',
        download: async () => {
          const dlRes = await client.post(
            action,
            new URLSearchParams({
              _token: itemToken,
              username: username ?? '',
              url: optionValue,
              action_type: ftype,
            }).toString(),
            {
              responseType: 'arraybuffer',
              headers: {
                'content-type': 'application/x-www-form-urlencoded',
                origin: SNAPSAVE_BASE,
                referer: `${SNAPSAVE_BASE}/`,
                ...(session.xsrfToken ? { 'x-xsrf-token': session.xsrfToken } : {}),
                cookie: session.cookie,
              },
            },
          );
          return Buffer.from(dlRes.data as ArrayBuffer);
        },
      });
    }

    if (media.length === 0) {
      throw new Error('snapsave: khong tim thay media nao trong phan hoi.');
    }

    return {
      postId: extractShortcode(url),
      username: extractAuthor(url),
      caption,
      stats: { likes: '', comments: '', views: '' }, // snapsave khong tra day du stats nhu savethreads
      media,
    };
  });
}

export type MediaSourceName = 'savethreads' | 'snapsave';

const PROVIDERS: Record<MediaSourceName, (url: string) => Promise<PostMedia>> = {
  savethreads: fetchViaSaveThreads,
  snapsave: fetchViaSnapsave,
};

const PROVIDER_LABEL: Record<MediaSourceName, string> = {
  savethreads: 'savethreads.io',
  snapsave: 'snapsave.vn',
};

/** Nen tang mac dinh (nguoi dung chon o trang Thu thap) - chua cau hinh -> savethreads. */
function getDefaultProvider(): MediaSourceName {
  const raw = getSetting('media_source_default');
  return raw === 'snapsave' ? 'snapsave' : 'savethreads';
}

/**
 * Nhan 1 URL bai Threads -> tra media + caption. Thu nen tang mac dinh (chon o trang Thu thap,
 * mac dinh savethreads.io - day du stats hon) truoc; neu loi (rate-limit, sap, doi dinh dang...)
 * thi fallback sang nen tang con lai - khong phu thuoc hoan toan vao 1 nguon duy nhat.
 */
export async function getPostMedia(
  url: string,
  log?: (message: string) => void,
): Promise<PostMedia> {
  const primary = getDefaultProvider();
  const fallback: MediaSourceName = primary === 'savethreads' ? 'snapsave' : 'savethreads';

  log?.(`Lấy metadata + link media qua ${PROVIDER_LABEL[primary]}...`);
  try {
    return await PROVIDERS[primary](url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const fallbackMsg = `${PROVIDER_LABEL[primary]} lỗi (${msg}), thử ${PROVIDER_LABEL[fallback]}...`;
    console.warn(`[mediaSource] ${fallbackMsg}`);
    log?.(fallbackMsg);
    return await PROVIDERS[fallback](url);
  }
}
