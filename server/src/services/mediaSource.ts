import axios, { type AxiosInstance } from 'axios';
import { z } from 'zod';
import { extractShortcode, extractAuthor } from '../utils/postId';
import { getProxyAgent } from '../utils/httpAgent';

/**
 * ===== Interface chung (KHONG doi khi doi nguon media) =====
 * Step 3 (download) va Step 5 (orchestration) chi biet ham getPostMedia(),
 * khong quan tam ben trong goi savethreads hay parse Playwright.
 */
export interface MediaItem {
  type: 'video' | 'image';
  url: string;
  ext?: string; // 'mp4', 'jpg' ... dung de dat ten file o Step 3
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

/**
 * Nhan 1 URL bai Threads -> tra media + caption.
 * Luu y: URL media tra ve co token het han -> tai ngay o Step 3.
 */
export async function getPostMedia(url: string): Promise<PostMedia> {
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
}
