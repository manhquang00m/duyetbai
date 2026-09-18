import type { Page } from 'playwright';
import { getBrowser } from './browser';
import { extractAuthor } from '../utils/postId';
import { withRetry } from '../utils/retry';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

// Link "share" (khong co /post/, khong co @username). Da xac nhan qua test truc tiep: Threads
// KHONG tra HTTP redirect cho link nay (GET thuong tra 200 + SPA shell rong, khong co og:url/
// canonical/username o dau ca) - JS phia client moi doi URL bar sang dang chuan @user/post/ID
// SAU KHI trang load. Vi vay phai dung browser thuc (Playwright, dung chung getBrowser() voi
// scrape comment) de "cho" JS chay xong roi doc lai URL, khong the resolve bang axios/HTTP thuan.
const SHARE_LINK_RE = /^https?:\/\/(?:www\.)?threads\.com\/share\//i;

async function resolveOnce(url: string): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'vi-VN' });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Threads doi URL bang history.pushState (SPA), KHONG phai navigation/frame event thuc su
    // -> page.waitForURL() khong bat duoc (da kiem chung truc tiep). Phai poll page.url() thay vi
    // cho event. Da xac nhan qua test truc tiep: URL doi trong ~1s sau khi trang load xong.
    const deadline = Date.now() + 15_000;
    while (!/\/post\//.test(page.url()) && Date.now() < deadline) {
      await page.waitForTimeout(300);
    }
    const finalUrl = page.url();
    // Neu het thoi gian cho ma URL van chua doi -> phai throw de withRetry con co co hoi
    // thu lai (lan dau Chromium "cold start" trong 1 process co the cham hon 15s). Neu chi
    // return nguyen url cu, withRetry se coi la "thanh cong" va bo qua retry oan uong.
    if (!/\/post\//.test(finalUrl)) {
      throw new Error(`Threads chua doi URL sang dang chuan sau khi cho: ${url}`);
    }
    return finalUrl;
  } finally {
    await context.close();
  }
}

/**
 * Phan giai link "share" ve URL chuan (@username/post/ID) bang cach mo bang browser thuc,
 * cho JS phia Threads doi URL bar. Link da chuan (co /post/) thi tra nguyen, khong mo browser.
 * Neu sau khi cho (15s) JS van chua doi URL, hoac mo trang loi -> tra ve URL goc, de
 * extractShortcode/extractAuthor phia sau bao loi ro rang nhu cu (thay vi nuot loi im lang).
 */
export async function resolveThreadsUrl(url: string): Promise<string> {
  if (!SHARE_LINK_RE.test(url)) return url;
  try {
    return await withRetry(() => resolveOnce(url), { retries: 2, label: `resolve share ${url}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[resolveThreadsUrl] khong resolve duoc sau khi da retry (${msg}) - giu URL goc: ${url}`);
    return url;
  }
}

// Bat link shopee: shopee.vn, s.shopee.vn, shp.ee (link rut gon)
const SHOPEE_RE = /https?:\/\/(?:[\w-]+\.)*(?:shopee\.vn|shp\.ee)[^\s"'<>)\]]*/gi;

// Nhan biet cac phan "rac" khong phai noi dung comment
const DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const DATE_ANY = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;
const COUNT_RE = /^[\d.,]+\s*[KMB]?(\s+[\d.,]+\s*[KMB]?)*$/i; // "15 2", "26.6K"
const NOISE_RE =
  /^(Tác giả|Author|Xem bản dịch|See translation|Dịch|Translate|Thích|Đã thích|Like|Trả lời|Reply|Chia sẻ|Share)$/i;

export interface Comment {
  author: string;
  text: string; // da lam sach
  shopeeLinks: string[];
  isOriginalPost: boolean;
  byAuthor: boolean; // reply co badge "Tác giả" (cua chu bai)
}

export interface SellerEntry {
  comment: string;
  link: string;
}

export interface ScrapeResult {
  postDate: string; // ngay dang bai goc
  comments: Comment[];
}

interface RawContainer {
  author: string;
  parts: string[];
  hrefs: string[];
  dateAttr: string;
  index: number;
}

function extractShopeeFromHref(href: string): string[] {
  const candidates = [href];
  try {
    const u = new URL(href);
    const redirect = u.searchParams.get('u');
    if (redirect) candidates.push(decodeURIComponent(redirect));
  } catch {
    /* href khong phai URL hop le */
  }
  const found: string[] = [];
  for (const c of candidates) {
    const matches = c.match(SHOPEE_RE);
    if (matches) found.push(...matches);
  }
  return found;
}

/** Lay ngay tu 1 container: uu tien <time datetime>, roi den text dd/mm/yyyy. */
function pickDate(raw: RawContainer): string {
  if (raw.dateAttr) {
    // ISO -> dd/mm/yyyy (khong dung Date de tranh lech mui gio)
    const m = raw.dateAttr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  for (const p of raw.parts) {
    const m = p.match(DATE_ANY);
    if (m) return m[0];
  }
  return '';
}

/** Loc bo rac (user, ngay, "Tác giả", so like/reply...) -> con noi dung comment. */
function cleanComment(parts: string[], author: string): string {
  const cleaned: string[] = [];
  for (let p of parts) {
    p = p.replace(/·\s*Tác giả/gi, '').replace(DATE_ANY, '').trim();
    if (!p) continue;
    if (p === author) continue;
    if (DATE_RE.test(p)) continue;
    if (COUNT_RE.test(p)) continue;
    if (NOISE_RE.test(p)) continue;
    cleaned.push(p);
  }
  return [...new Set(cleaned)].join(' ').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
}

async function dismissDialogs(page: Page): Promise<void> {
  const labels = ['Close', 'Đóng', 'Not now', 'Lúc khác', 'Allow all cookies', 'Cho phép'];
  for (const name of labels) {
    const btn = page.getByRole('button', { name });
    if (await btn.count().catch(() => 0)) {
      await btn.first().click({ timeout: 2000 }).catch(() => {});
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
}

async function autoScroll(page: Page, rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(1000 + Math.floor(Math.random() * 900));
  }
}

export async function scrapePost(url: string): Promise<ScrapeResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'vi-VN',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await dismissDialogs(page);
    await autoScroll(page);

    const raw: RawContainer[] = await page.evaluate(() => {
      // Chi lay container top-level; Threads long container trong nhau ->
      // neu khong loc se quet 1 comment nhieu lan (in trung).
      const containers = Array.from(
        document.querySelectorAll('div[data-pressable-container="true"]'),
      ).filter((c) => !c.parentElement?.closest('[data-pressable-container="true"]'));
      return containers.map((c, index) => {
        const authorEl = c.querySelector('a[href^="/@"]');
        const href = authorEl?.getAttribute('href') ?? '';
        const author = href.replace(/^\/@?/, '').split('/')[0];

        const parts = Array.from(c.querySelectorAll('[dir="auto"]'))
          .map((e) => (e as HTMLElement).innerText.trim())
          .filter(Boolean);

        const hrefs = Array.from(c.querySelectorAll('a[href]')).map(
          (a) => (a as HTMLAnchorElement).href,
        );

        const timeEl = c.querySelector('time');
        const dateAttr = timeEl?.getAttribute('datetime') ?? '';

        return { author, parts, hrefs, dateAttr, index };
      });
    });

    const seen = new Set<string>();
    const comments: Comment[] = [];
    for (const item of raw) {
      const text = cleanComment(item.parts, item.author);
      if (!text) continue;
      const key = `${item.author}::${text}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const shopeeLinks = new Set<string>();
      for (const href of item.hrefs) {
        for (const s of extractShopeeFromHref(href)) shopeeLinks.add(s);
      }
      const tm = item.parts.join(' ').match(SHOPEE_RE);
      if (tm) tm.forEach((m) => shopeeLinks.add(m));

      comments.push({
        author: item.author,
        text,
        shopeeLinks: [...shopeeLinks],
        isOriginalPost: item.index === 0,
        byAuthor: /tác giả|\bauthor\b/i.test(item.parts.join(' ')),
      });
    }

    const postDate = raw.length ? pickDate(raw[0]) : '';
    return { postDate, comments };
  } finally {
    await context.close();
  }
}

/** Comment CUA CHU BAI + co link shopee (bo bai goc) -> tung cap {comment, link}. */
export async function getSellerShopeeEntries(
  url: string,
): Promise<{ postDate: string; entries: SellerEntry[]; shopeeCommentCount: number }> {
  const { postDate, comments } = await scrapePost(url);

  // Chu bai = tac gia bai goc scrape duoc (chinh xac hon username trong URL),
  // fallback ve username trong URL neu khong xac dinh duoc.
  const original = comments.find((c) => c.isOriginalPost);
  const owner = (original?.author || extractAuthor(url)).toLowerCase();

  // Cac comment cua chu bai co it nhat 1 link shopee.
  const shopeeComments = comments.filter(
    (c) =>
      !c.isOriginalPost &&
      (c.byAuthor || c.author.toLowerCase() === owner) &&
      c.shopeeLinks.length > 0,
  );
  const shopeeCommentCount = shopeeComments.length;

  // Chi ghi 1 comment SOM NHAT; dedup link trung trong comment do.
  const entries: SellerEntry[] = [];
  if (shopeeComments.length > 0) {
    const c = shopeeComments[0];
    const seenLink = new Set<string>();
    for (const link of c.shopeeLinks) {
      if (seenLink.has(link)) continue;
      seenLink.add(link);
      entries.push({ comment: c.text, link });
    }
  }
  return { postDate, entries, shopeeCommentCount };
}
