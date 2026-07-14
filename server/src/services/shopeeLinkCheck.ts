import fs from 'node:fs';
import axios from 'axios';
import { getShopeeBrowser } from './browser';
import { getProxyAgent } from '../utils/httpAgent';
import { SHOPEE_SESSION_PATH } from '../config';

export type ShopeeLinkStatus = 'available' | 'unavailable' | 'unknown';

export interface ShopeeLinkCheckResult {
  link: string;
  status: ShopeeLinkStatus;
  message: string;
  title?: string;
  image?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Shopee tra HTML preview nhe (og:title/og:image) rieng cho UA cua bot mang xa hoi
// (dung de tao preview khi chia se link) - request nay KHONG bi he thong chong-bot chan,
// da kiem chung truc tiep. Chi co ten/anh, KHONG co tin hieu con hang/het hang.
const CRAWLER_USER_AGENT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

// Cac cum tu tren trang Shopee bao san pham het hang / khong con ton tai.
const UNAVAILABLE_PATTERNS: RegExp[] = [
  /hết\s*hàng/i,
  /(sản phẩm|trang).*(không tồn tại|không khả dụng|đã bị gỡ|ngừng kinh doanh)/i,
  /(san\s*pham|trang)\s*(khong\s*ton\s*tai|khong\s*kha\s*dung|da\s*bi\s*go|ngung\s*kinh\s*doanh)/i,
  /this (item|product) is (no longer available|unavailable|not available)/i,
  /product not found/i,
  /page not found/i,
  /không tìm thấy trang/i,
  /oops.*(nothing|not found)/i,
];

const BOT_CHECK_PATTERNS: RegExp[] = [
  /xác minh.*(không phải|robot|người dùng)/i,
  /verify you are human/i,
  /unusual traffic/i,
  /are you a robot/i,
  /captcha/i,
];

const BUY_BUTTON_SELECTOR =
  'button:has-text("Mua Ngay"), button:has-text("Thêm Vào Giỏ Hàng"), button:has-text("Buy Now"), button:has-text("Add to Cart")';

const SHORT_LINK_RE = /^https?:\/\/(?:[\w-]+\.)*(?:s\.shopee\.vn|shp\.ee)\//i;

async function resolveShortLink(url: string): Promise<string> {
  if (!SHORT_LINK_RE.test(url)) return url;
  try {
    const agent = getProxyAgent();
    const res = await axios.get(url, {
      maxRedirects: 5,
      timeout: 20_000,
      headers: { 'user-agent': USER_AGENT },
      validateStatus: () => true,
      proxy: false, // luon tuong minh, tranh axios tu doc HTTPS_PROXY tu env
      ...(agent ? { httpAgent: agent, httpsAgent: agent } : {}),
    });
    const responseUrl = (res.request as { res?: { responseUrl?: string } } | undefined)?.res
      ?.responseUrl;
    return responseUrl || url;
  } catch {
    return url;
  }
}

function extractMeta(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`,
    'i',
  );
  return html.match(re)?.[1];
}

/**
 * Lay ten + anh preview san pham bang cach gia lam bot preview mang xa hoi (khong dung trinh duyet).
 * Chi phuc vu hien thi, khong dung de suy ra con hang/het hang.
 */
async function fetchProductPreview(
  link: string,
  log: (message: string) => void,
): Promise<{ title?: string; image?: string }> {
  try {
    log('Đang lấy tên/ảnh sản phẩm (HTTP thuần)...');
    const agent = getProxyAgent();
    const res = await axios.get(link, {
      maxRedirects: 5,
      timeout: 15_000,
      headers: { 'user-agent': CRAWLER_USER_AGENT },
      validateStatus: () => true,
      proxy: false,
      ...(agent ? { httpAgent: agent, httpsAgent: agent } : {}),
    });
    const html = typeof res.data === 'string' ? res.data : '';
    const title = extractMeta(html, 'og:title');
    const image = extractMeta(html, 'og:image');
    if (title) log(`Đã lấy được tên sản phẩm: "${title}"`);
    else log('Không lấy được tên sản phẩm từ trang.');
    return { title, image };
  } catch {
    log('Không lấy được tên/ảnh sản phẩm (bỏ qua, không ảnh hưởng kết quả trạng thái).');
    return {};
  }
}

export async function checkShopeeLink(
  rawLink: string,
  onLog?: (message: string) => void,
): Promise<ShopeeLinkCheckResult> {
  const log = (m: string) => onLog?.(m);
  const link = rawLink.trim();
  if (!link) return { link, status: 'unknown', message: 'Không có link' };

  // Lay ten/anh preview truoc, dung link GOC (con nguyen query/tracking) vi Shopee can cac
  // tham so nay de xac dinh dung san pham cu the - bo query se ra trang preview chung chung
  // (da xac nhan qua test truc tiep: cung link nhung bo query -> tra ve tieu de trang chu Shopee).
  const preview = await fetchProductPreview(link, log);

  log('Đang phân giải link rút gọn (nếu có)...');
  let resolvedLink = await resolveShortLink(link);
  if (resolvedLink !== link) log(`Đã phân giải ra link sản phẩm: ${resolvedLink}`);
  try {
    const u = new URL(resolvedLink);
    resolvedLink = `${u.origin}${u.pathname}`; // bo query/tracking params - chi dung cho buoc mo trinh duyet
  } catch {
    /* giu nguyen */
  }

  const hasSession = fs.existsSync(SHOPEE_SESSION_PATH);
  log(
    hasSession
      ? 'Đang mở trang bằng trình duyệt (dùng phiên đăng nhập đã lưu) để kiểm tra trạng thái còn hàng...'
      : 'Đang mở trang bằng trình duyệt (phiên ẩn danh, chưa đăng nhập) để kiểm tra trạng thái còn hàng...',
  );
  const browser = await getShopeeBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'vi-VN',
    viewport: { width: 1366, height: 900 },
    ...(hasSession ? { storageState: SHOPEE_SESSION_PATH } : {}),
  });
  // Che vai dau hieu automation de-facto (webdriver flag, plugin/permission rong...) - cung ky
  // thuat cac thu vien "stealth" hay dung, tu viet de khong them dependency moi.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    (window as unknown as { chrome?: unknown }).chrome ??= { runtime: {} };
    const perms = window.navigator.permissions as unknown as {
      query: (p: { name: string }) => Promise<{ state: string }>;
    };
    const originalQuery = perms.query.bind(perms);
    perms.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });
  const page = await context.newPage();
  try {
    await page.goto(resolvedLink, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    log('Đã tải xong trang, chờ nội dung render...');
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    log('Đang đọc nội dung trang...');
    const rawBodyText = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    const bodyText = rawBodyText.normalize('NFC');
    const finalUrl = page.url();

    if (/\/verify\/traffic/i.test(finalUrl)) {
      log('Bị đưa qua trang xác minh chống bot của Shopee (/verify/traffic).');
      return {
        link,
        status: 'unknown',
        message: 'Bị Shopee chặn xác minh chống bot khi mở trang — chưa xác định được trạng thái',
        ...preview,
      };
    }
    for (const re of BOT_CHECK_PATTERNS) {
      if (re.test(bodyText)) {
        return {
          link,
          status: 'unknown',
          message: 'Trang yêu cầu xác minh chống bot (captcha) — chưa xác định được trạng thái',
          ...preview,
        };
      }
    }
    for (const re of UNAVAILABLE_PATTERNS) {
      if (re.test(bodyText)) {
        return {
          link,
          status: 'unavailable',
          message: 'Trang hiển thị dấu hiệu hết hàng/không tồn tại',
          ...preview,
        };
      }
    }
    const buyButtonCount = await page.locator(BUY_BUTTON_SELECTOR).count().catch(() => 0);
    if (buyButtonCount > 0) {
      return {
        link,
        status: 'available',
        message: 'Còn hàng (tìm thấy nút mua trên trang)',
        ...preview,
      };
    }
    const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 500);
    return {
      link,
      status: 'unknown',
      message: `Không xác định rõ trạng thái. Trích nội dung trang: "${snippet}"`,
      ...preview,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { link, status: 'unknown', message: `Lỗi mở trang: ${msg}`, ...preview };
  } finally {
    await context.close();
  }
}
