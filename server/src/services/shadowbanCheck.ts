import { chromium, type Browser, type Page } from 'playwright';
import { getBrowser } from './browser';
import { USER_AGENT, dismissDialogs } from './comments';
import { startGpmProfile, stopGpmProfile } from './gpmLogin';
import {
  countPostRunsBetween,
  insertShadowbanCheck,
  insertViewSnapshot,
  latestViewsByPost,
  type ShadowbanCheckInput,
  type ShadowbanVerdict,
} from '../db/shadowban';
import {
  GPM_GLOBAL_URL,
  GPM_STABLE_URL,
  SHADOWBAN_BASELINE_POSTS,
  SHADOWBAN_RECENT_POSTS,
  SHADOWBAN_VIEWER_EDITION,
  SHADOWBAN_VIEWER_PROFILE_ID,
} from '../config';

// Check shadowban 1 nick Threads. Threads KHONG co API bao shadowban -> chi gom tin hieu roi doan:
//   1. Luot xem: mo tung bai luc KHONG dang nhap, doc "N luot xem" (da xac nhan tren may that:
//      savethreads.io tra views=0 sai, va loi voi bai chi co chu -> khong dung duoc). So median
//      bai gan nhat voi baseline (bai cu hon + lich su trong DB).
//   2. Bai bi an: so bai tool auto bao da dang (post_runs) vs so bai hien tren trang profile.
//   3. Search: nick "viewer" (profile GPM da dang nhap, nick khac) tim @username - khong ra = search ban.
// Ket qua chi la goi y - nguoi van hanh tu quyet, KHONG tu doi trang thai account.

const HOUR = 3_600_000;
/** Bai moi dang chua du thoi gian len view -> khong tinh vao median. */
const MIN_POST_AGE_MS = 12 * HOUR;
/** Cua so dem bai bi an: tu 72h truoc toi 1h truoc (bai vua dang co the chua kip hien). */
const HIDDEN_WINDOW_FROM_MS = 72 * HOUR;
const HIDDEN_WINDOW_TO_MS = 1 * HOUR;
/**
 * Moi bai tool dang kem 1 reply tu comment link Shopee ngay sau do (~1 phut) - tren trang profile
 * reply nay hien nhu 1 bai rieng. Bai cach bai truoc it hon khoang nay = reply, khong tinh.
 */
const SELF_REPLY_GAP_MS = 10 * 60_000;
/** Median view duoi muc nay coi la "gan nhu khong ai thay" (nick binh thuong dat 400-1k). */
const LOW_VIEWS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(1500 + Math.floor(Math.random() * 1500));

/**
 * "7" -> 7, "12.345" -> 12345, "1,2K" / "1,2 N" (nghin) -> 1200, "3 Tr" / "3M" -> 3000000.
 * Rong / khong doc duoc -> null.
 */
export function parseCount(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^([\d.,]+)(K|N|nghìn|M|Tr|triệu)?$/i);
  if (!m) return null;
  const suffix = (m[2] ?? '').toLowerCase();
  if (!suffix) {
    const n = Number(m[1].replace(/[.,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const base = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(base)) return null;
  const mult = suffix === 'k' || suffix === 'n' || suffix === 'nghìn' ? 1_000 : 1_000_000;
  return Math.round(base * mult);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Date -> 'YYYY-MM-DD HH:MM:SS' gio dia phuong, cung dinh dang post_runs.posted_at. */
function toLocalSql(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

export interface Signals {
  profileVisible: boolean | null;
  searchVisible: boolean | null;
  recentMedian: number | null;
  baselineMedian: number | null;
  ratio: number | null;
  expectedPosts: number | null;
  hiddenPosts: number | null;
}

/** Ham thuan: tin hieu -> ket luan + ly do (tieng Viet, hien thang len UI). */
export function decideVerdict(s: Signals): { verdict: ShadowbanVerdict; reasons: string[] } {
  const reasons: string[] = [];

  if (s.profileVisible === false) {
    reasons.push('Profile không xem được khi không đăng nhập (Threads bắt đăng nhập hoặc không tìm thấy) - nick có thể bị hạn chế/khoá');
    return { verdict: 'shadowban', reasons };
  }

  const viewsStrong =
    s.recentMedian !== null && ((s.ratio !== null && s.ratio < 0.1) || s.recentMedian < LOW_VIEWS);
  const viewsWeak = !viewsStrong && s.ratio !== null && s.ratio < 0.3;
  const hidden = s.hiddenPosts !== null && s.hiddenPosts > 0;

  if (s.searchVisible === false) reasons.push('Không tìm thấy nick khi search bằng nick khác');
  if (viewsStrong) {
    reasons.push(
      s.ratio !== null && s.ratio < 0.1
        ? `View giảm mạnh: median ${s.recentMedian} so với ${s.baselineMedian} trước đây`
        : `View rất thấp: median ${s.recentMedian} lượt xem` +
            (s.baselineMedian !== null ? ` (các bài cũ hơn: ${s.baselineMedian})` : ''),
    );
  }
  if (viewsWeak) reasons.push(`View giảm: median ${s.recentMedian} so với ${s.baselineMedian} trước đây`);
  if (hidden) reasons.push(`${s.hiddenPosts}/${s.expectedPosts} bài đã đăng không hiện trên profile`);

  if (s.searchVisible === false || (viewsStrong && hidden)) return { verdict: 'shadowban', reasons };
  if (viewsStrong || viewsWeak || hidden) return { verdict: 'suspect', reasons };
  if (s.recentMedian === null && s.searchVisible === null && s.hiddenPosts === null) {
    reasons.push('Không đủ dữ liệu để kết luận');
    return { verdict: 'unknown', reasons };
  }
  return { verdict: 'ok', reasons };
}

interface ProfilePost {
  code: string;
  url: string;
  postedAt: string | null; // ISO UTC
}

/** Profile cong khai chac chan xem duoc khi khong dang nhap - doi chung khi bi bat dang nhap. */
const CONTROL_PROFILE = 'threads';

type ProfileStatus = 'ok' | 'login_wall' | 'not_found';

/** Mo trang profile luc khong dang nhap, lay danh sach bai CHINH (bo reply tu comment link). */
async function scrapeProfile(
  browser: Browser,
  name: string,
): Promise<{ status: ProfileStatus; posts: ProfilePost[] }> {
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'vi-VN', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    const res = await page.goto(`https://www.threads.com/@${name}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(5000);
    // Da gap tren may that: nick bi han che -> Threads chuyen sang /login/?next=... (nick khac cung
    // luc van xem duoc). Nhung IP bi chan vi mo nhieu trang cung ra y het -> phai doi chung o ngoai.
    if (/\/login\//.test(page.url())) return { status: 'login_wall', posts: [] };
    // Nick khong ton tai/bi khoa: Threads tra 404 hoac trang chung khong co "(@name)" trong title.
    const title = await page.title();
    if ((res && res.status() === 404) || !title.toLowerCase().includes(`@${name.toLowerCase()}`)) {
      return { status: 'not_found', posts: [] };
    }
    await dismissDialogs(page);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 4000);
      await page.waitForTimeout(1200 + Math.floor(Math.random() * 800));
    }

    const raw = await page.evaluate((author) => {
      const containers = Array.from(document.querySelectorAll('div[data-pressable-container="true"]')).filter(
        (c) => !c.parentElement?.closest('[data-pressable-container="true"]'),
      );
      const prefix = `/@${author}/post/`.toLowerCase();
      return containers.map((c) => {
        const link = Array.from(c.querySelectorAll('a[href*="/post/"]'))
          .map((a) => a.getAttribute('href') ?? '')
          .find((h) => h.toLowerCase().startsWith(prefix));
        return { href: link ?? '', time: c.querySelector('time')?.getAttribute('datetime') ?? '' };
      });
    }, name);

    const seen = new Set<string>();
    const all: ProfilePost[] = [];
    for (const r of raw) {
      const m = r.href.match(/\/post\/([A-Za-z0-9_-]+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      all.push({ code: m[1], url: `https://www.threads.com/@${name}/post/${m[1]}`, postedAt: r.time || null });
    }

    // Gom bai + reply tu comment: xep cu -> moi, bai sat ngay sau bai truoc la reply.
    const byTime = all
      .filter((p) => p.postedAt)
      .sort((a, b) => Date.parse(a.postedAt!) - Date.parse(b.postedAt!));
    const main: ProfilePost[] = [];
    for (const p of byTime) {
      const prev = main[main.length - 1];
      if (prev && Date.parse(p.postedAt!) - Date.parse(prev.postedAt!) < SELF_REPLY_GAP_MS) continue;
      main.push(p);
    }
    return { status: 'ok', posts: main.reverse() }; // moi nhat truoc
  } finally {
    await context.close();
  }
}

/** Mo 1 bai luc khong dang nhap, doc luot xem / like / reply. */
async function scrapePostStats(
  browser: Browser,
  url: string,
): Promise<{ views: number | null; likes: number | null; replies: number | null }> {
  const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'vi-VN' });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(4000);
    const text = await page.evaluate(() => document.body.innerText);
    // Dau trang bai: "Thread\n7 lượt xem" (ban EN: "7 views").
    const viewText = text.match(/([\d.,]+\s*(?:K|N|nghìn|M|Tr|triệu)?)\s*(?:lượt xem|views)/i)?.[1];
    // Like/reply khong co nhan chu tren giao dien -> doc tu JSON nhung trong HTML, lay lan xuat
    // hien DAU TIEN (bai chinh render truoc reply).
    const html = await page.content();
    const likes = html.match(/"like_count":(\d+)/)?.[1];
    const replies = html.match(/"direct_reply_count":(\d+)/)?.[1];
    const viewsJson = html.match(/"view_counts":(\d+)/)?.[1];
    return {
      views: parseCount(viewText) ?? parseCount(viewsJson),
      likes: parseCount(likes),
      replies: parseCount(replies),
    };
  } finally {
    await context.close();
  }
}

/** Nick viewer da mo san (1 lan cho ca job). page = null khi khong cau hinh. */
export interface Viewer {
  page: Page | null;
  close: () => Promise<void>;
}

export async function openViewer(log: (message: string) => void): Promise<Viewer> {
  if (!SHADOWBAN_VIEWER_PROFILE_ID) {
    log('Chưa cấu hình SHADOWBAN_VIEWER_PROFILE_ID -> bỏ qua bước search');
    return { page: null, close: async () => {} };
  }
  const baseUrl = SHADOWBAN_VIEWER_EDITION === 'global' ? GPM_GLOBAL_URL : GPM_STABLE_URL;
  log('Mở profile GPM viewer...');
  const address = await startGpmProfile(baseUrl, SHADOWBAN_VIEWER_EDITION, SHADOWBAN_VIEWER_PROFILE_ID);
  const browser = await chromium.connectOverCDP(`http://${address}`);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = await context.newPage();
  return {
    page,
    close: async () => {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
      await stopGpmProfile(baseUrl, SHADOWBAN_VIEWER_EDITION, SHADOWBAN_VIEWER_PROFILE_ID);
    },
  };
}

/** Search @name bang nick viewer. null = khong doc duoc trang ket qua (chua dang nhap, doi giao dien...). */
async function checkSearch(page: Page, name: string): Promise<boolean | null> {
  await page.goto(`https://www.threads.com/search?q=${encodeURIComponent(name)}&serp_type=default`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(5000);
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/@"]')).map((a) => a.getAttribute('href') ?? ''),
  );
  // Khong co link profile nao = trang chua load / bat dang nhap, khong phai "khong ra ket qua".
  if (hrefs.length === 0) return null;
  const self = `/@${name}`.toLowerCase();
  return hrefs.some((h) => {
    const l = h.toLowerCase().replace(/\/$/, '');
    return l === self || l.startsWith(`${self}/`);
  });
}

export interface AccountCheckResult extends ShadowbanCheckInput {
  reasons: string[];
}

/** Check 1 nick, ghi snapshot view + ket qua vao DB. */
export async function checkAccount(
  name: string,
  viewer: Viewer,
  log: (message: string) => void,
): Promise<AccountCheckResult> {
  const now = new Date();
  const checkedAt = now.toISOString();
  const errors: string[] = [];
  const browser = await getBrowser();

  log('Mở profile (không đăng nhập)...');
  const profile = await scrapeProfile(browser, name);
  // null = khong ket luan duoc (IP dang bi Threads bat dang nhap cho moi profile).
  let profileVisible: boolean | null = profile.status === 'ok';
  if (profile.status === 'login_wall') {
    log(`Bị bắt đăng nhập -> thử profile đối chứng @${CONTROL_PROFILE}...`);
    const control = await scrapeProfile(browser, CONTROL_PROFILE);
    if (control.status !== 'ok') {
      profileVisible = null;
      errors.push('profile: Threads đang bắt đăng nhập với mọi profile (IP check bị chặn) - thử lại sau');
    }
  }

  let recentMedian: number | null = null;
  let baselineMedian: number | null = null;
  let expectedPosts: number | null = null;
  let foundPosts: number | null = null;
  let hiddenPosts: number | null = null;
  const recentViews: { code: string; views: number | null }[] = [];

  if (profile.status === 'ok') {
    const eligible = profile.posts.filter((p) => p.postedAt && now.getTime() - Date.parse(p.postedAt) >= MIN_POST_AGE_MS);
    const recent = eligible.slice(0, SHADOWBAN_RECENT_POSTS);
    const older = eligible.slice(SHADOWBAN_RECENT_POSTS, SHADOWBAN_RECENT_POSTS + SHADOWBAN_BASELINE_POSTS);
    log(`Profile có ${profile.posts.length} bài, lấy view ${recent.length + older.length} bài...`);

    for (const p of [...recent, ...older]) {
      await jitter();
      try {
        const stats = await scrapePostStats(browser, p.url);
        insertViewSnapshot({ accountName: name, postCode: p.code, postUrl: p.url, postedAt: p.postedAt, ...stats }, checkedAt);
        if (recent.includes(p)) recentViews.push({ code: p.code, views: stats.views });
      } catch (err) {
        errors.push(`${p.code}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    recentMedian = median(recentViews.map((r) => r.views).filter((v): v is number => v !== null));

    // Baseline: snapshot moi nhat cua moi bai CU hon bai gan nhat dang xet (gom ca lich su cac lan
    // check truoc) - nick bi shadowban lau thi baseline chi con o lich su.
    const oldestRecent = recent[recent.length - 1]?.postedAt;
    if (oldestRecent) {
      const baseline = latestViewsByPost(name)
        .filter((s) => s.posted_at && s.posted_at < oldestRecent && s.views !== null)
        .map((s) => s.views as number);
      if (baseline.length >= 3) baselineMedian = median(baseline);
    }

    // Bai bi an: chi so duoc khi trang profile cuon toi truoc dau cua so (khong thi thieu bai la
    // do chua cuon toi, khong phai bi an).
    const from = new Date(now.getTime() - HIDDEN_WINDOW_FROM_MS);
    const to = new Date(now.getTime() - HIDDEN_WINDOW_TO_MS);
    const oldestSeen = profile.posts[profile.posts.length - 1]?.postedAt;
    if (oldestSeen && Date.parse(oldestSeen) <= from.getTime()) {
      expectedPosts = countPostRunsBetween(name, toLocalSql(from), toLocalSql(to));
      foundPosts = profile.posts.filter((p) => {
        const t = Date.parse(p.postedAt!);
        return t >= from.getTime() && t <= to.getTime();
      }).length;
      hiddenPosts = Math.max(0, expectedPosts - foundPosts);
    }
  }

  let searchVisible: boolean | null = null;
  if (viewer.page) {
    log('Search bằng nick viewer...');
    try {
      searchVisible = await checkSearch(viewer.page, name);
      if (searchVisible === null) errors.push('search: không đọc được trang kết quả (viewer chưa đăng nhập?)');
    } catch (err) {
      errors.push(`search: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const ratio =
    recentMedian !== null && baselineMedian ? Math.round((recentMedian / baselineMedian) * 100) / 100 : null;
  const { verdict, reasons } = decideVerdict({
    profileVisible,
    searchVisible,
    recentMedian,
    baselineMedian,
    ratio,
    expectedPosts,
    hiddenPosts,
  });

  const result: AccountCheckResult = {
    accountName: name,
    verdict,
    recentMedian,
    baselineMedian,
    ratio,
    profileVisible,
    searchVisible,
    expectedPosts,
    foundPosts,
    hiddenPosts,
    details: { reasons, recentViews, errors },
    reasons,
  };
  insertShadowbanCheck(result, checkedAt);
  return result;
}
