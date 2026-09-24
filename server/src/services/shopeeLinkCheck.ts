import fs from 'node:fs';
import axios from 'axios';
import { getShopeeBrowser } from './browser';
import { getProxyAgent } from '../utils/httpAgent';
import { SHOPEE_SESSION_PATH } from '../config';

/**
 * - available: con hang, mua duoc
 * - dead: link khong ton tai (shortlink khong phan giai duoc / 404 / bi day ve trang chu)
 * - out_of_stock: link con song nhung san pham het hang
 * - unknown: chua ket luan duoc (bi chan bot, timeout, trang la)
 */
export type ShopeeLinkStatus = 'available' | 'dead' | 'out_of_stock' | 'unknown';

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

// Shopee tra HTML preview nhe (og:title/og:image/og:url) rieng cho UA cua bot mang xa hoi.
// Day la nguon tin cay nhat hien nay vi KHONG bi chan (trang web thuong da bat buoc dang nhap).
// Do duoc:
//   - san pham CON TON TAI -> og:title la ten san pham that + co the og:url (link chuan -i.shop.item)
//   - san pham DA BI GO    -> bi tra ve trang chu: og:title la tieu de chung, KHONG co og:url
// Khong co tin hieu con hang/het hang -> phai mo trinh duyet moi phan biet duoc.
const CRAWLER_USER_AGENT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

// Tieu de Shopee tra ve khi link KHONG tro toi san pham nao (bi day ve trang chu).
const GENERIC_TITLE_RE = /^Shopee Việt Nam \s*\|/i;

// Trang chan cua Shopee doi dang nhap moi cho xem san pham -> khong phai link hong.
const LOGIN_REQUIRED_PATTERNS: RegExp[] = [
  /cần đăng nhập/i,
  /đăng nhập để tiếp tục/i,
  /please log ?in/i,
];

// Cac cum tu bao san pham/trang KHONG CON TON TAI (link chet).
const DEAD_PATTERNS: RegExp[] = [
  /(sản phẩm|trang).*(không tồn tại|không khả dụng|đã bị gỡ|ngừng kinh doanh)/i,
  /(san\s*pham|trang)\s*(khong\s*ton\s*tai|khong\s*kha\s*dung|da\s*bi\s*go|ngung\s*kinh\s*doanh)/i,
  /product not found/i,
  /page not found/i,
  /không tìm thấy trang/i,
  /oops.*(nothing|not found)/i,
];

// Cac cum tu bao san pham CON TON TAI nhung HET HANG.
const OUT_OF_STOCK_PATTERNS: RegExp[] = [
  /hết\s*hàng/i,
  /het\s*hang/i,
  /sold\s*out/i,
  /this (item|product) is (no longer available|unavailable|not available)/i,
];

const BOT_CHECK_PATTERNS: RegExp[] = [
  /xác minh.*(không phải|robot|người dùng)/i,
  /verify you are human/i,
  /unusual traffic/i,
  /are you a robot/i,
  /captcha/i,
];

// Nhan dien nut mua theo CHU tren nut (class cua Shopee bi hash, doi bat cu luc nao).
const BUY_BUTTON_TEXT_RE = /mua ngay|thêm vào giỏ hàng|buy now|add to cart/i;

// Het hang: Shopee KHONG dat thuoc tinh `disabled` cho nut, ma them hau to `--disabled` vao class
// (vd "btn-solid-primary--disabled") kem aria-disabled="true". Da do truc tiep tren ca 2 trang:
//   con hang -> class="btn btn-solid-primary btn--l ..."            aria-disabled="false"
//   het hang -> class="btn btn-solid-primary btn--l btn-solid-primary--disabled ..." aria-disabled="true"
const DISABLED_CLASS_RE = /--disabled/;

const SHORT_LINK_RE = /^https?:\/\/(?:[\w-]+\.)*(?:s\.shopee\.vn|shp\.ee)\//i;

// Cac dang URL trang san pham Shopee (deu da gap thuc te):
//   /<slug>-i.<shopId>.<itemId>   /product/<shopId>/<itemId>   /<shopUsername>/<shopId>/<itemId>
// Shortlink con song luon redirect ve mot trong ba dang nay; link chet bi day ve trang chu
// hoac trang loi (khong khop) -> dung lam tin hieu nhan biet link chet ma khong can mo browser.
const PRODUCT_URL_RE = /(-i\.\d+\.\d+|\/product\/\d+\/\d+|\/[\w.-]+\/\d{6,}\/\d{6,})/i;

// Tach (shopId, itemId) tu bat ky dang URL san pham nao o tren.
const PRODUCT_IDS_RE = /(?:-i\.(\d+)\.(\d+)|\/(?:product\/)?[\w.-]*?\/?(\d{6,})\/(\d{6,}))/i;

/**
 * Chuan hoa ve dang /product/<shopId>/<itemId>.
 * Bat buoc: da do thuc te, dang /<shopUsername>/<shopId>/<itemId> (link affiliate hay tra ve)
 * KHONG tra ve the og: nao, con dang /product/... thi tra ve day du -> khong chuan hoa se
 * bao nham moi link la link chet.
 */
function toProductUrl(url: string): string {
  const m = url.match(PRODUCT_IDS_RE);
  if (!m) return url;
  const shopId = m[1] ?? m[3];
  const itemId = m[2] ?? m[4];
  return shopId && itemId ? `https://shopee.vn/product/${shopId}/${itemId}` : url;
}

interface ResolveResult {
  url: string; // URL cuoi sau khi theo redirect (hoac URL goc neu khong phan giai duoc)
  httpStatus: number | null; // null = request loi han (timeout/DNS/proxy)
  redirected: boolean; // co thuc su nhay sang URL khac khong
  error?: string;
}

async function resolveShortLink(url: string): Promise<ResolveResult> {
  if (!SHORT_LINK_RE.test(url)) return { url, httpStatus: null, redirected: false };
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
    const finalUrl = responseUrl || url;
    return { url: finalUrl, httpStatus: res.status, redirected: finalUrl !== url };
  } catch (err) {
    return {
      url,
      httpStatus: null,
      redirected: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Ket luan "link chet" chi bang HTTP, khong can mo trinh duyet.
 * Tra ve ly do neu chet, undefined neu link con song (can kiem tra tiep bang browser).
 */
function deadLinkReason(rawLink: string, resolved: ResolveResult): string | undefined {
  // Request loi han (timeout/proxy/DNS) -> khong ket luan gi, de buoc browser quyet dinh.
  if (resolved.error) return undefined;
  if (resolved.httpStatus !== null && resolved.httpStatus >= 400) {
    return `Link không tồn tại (máy chủ Shopee trả về HTTP ${resolved.httpStatus})`;
  }
  // Shortlink ma khong nhay di dau -> ma rut gon khong con hieu luc.
  if (SHORT_LINK_RE.test(rawLink) && SHORT_LINK_RE.test(resolved.url)) {
    return 'Link rút gọn không phân giải được sang trang sản phẩm (mã rút gọn không còn hiệu lực)';
  }
  // Da nhay di nhung diem den khong phai trang san pham (thuong la trang chu Shopee).
  if (resolved.redirected && !PRODUCT_URL_RE.test(resolved.url)) {
    return `Link không dẫn tới trang sản phẩm (bị chuyển về ${resolved.url})`;
  }
  return undefined;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Doc content cua 1 the <meta property|name="...">.
 * Phai quet tung the roi moi doc thuoc tinh vi Shopee dat content TRUOC property o trang san pham
 * (nhung lai dat property truoc o trang chu) - regex co dinh thu tu se bo sot dung truong hop
 * quan trong nhat.
 */
function extractMeta(html: string, property: string): string | undefined {
  const propRe = new RegExp(`(?:property|name)=["']${property}["']`, 'i');
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    if (!propRe.test(tag)) continue;
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return decodeEntities(content);
  }
  return undefined;
}

interface ProductMeta {
  title?: string;
  image?: string;
  canonicalUrl?: string; // og:url - link chuan dang /<slug>-i.<shopId>.<itemId>
  exists?: boolean; // undefined = khong doc duoc trang, khong ket luan gi
}

/**
 * Doc the og: cua trang san pham bang UA bot preview mang xa hoi (khong dung trinh duyet).
 * Vua lay ten/anh de hien thi, vua la CACH DUY NHAT hien nay biet san pham con ton tai hay khong
 * ma khong bi Shopee chan (xem chu thich o CRAWLER_USER_AGENT).
 */
async function fetchProductMeta(link: string, log: (message: string) => void): Promise<ProductMeta> {
  try {
    log(`Đang đọc thông tin sản phẩm (HTTP thuần): ${link}`);
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
    if (!html) {
      log(`Không đọc được nội dung trang (HTTP ${res.status}).`);
      return {};
    }
    const title = extractMeta(html, 'og:title');
    const image = extractMeta(html, 'og:image');
    const canonicalUrl = extractMeta(html, 'og:url');
    // Trang chu Shopee (khi san pham da bi go) van co og:title nhung la tieu de chung va KHONG co og:url.
    const generic = !title || GENERIC_TITLE_RE.test(title) || !canonicalUrl;
    if (generic) log('Trang không trả về thông tin sản phẩm nào.');
    else log(`Đã lấy được tên sản phẩm: "${title}"`);
    return generic
      ? { exists: false }
      : { title: title?.replace(/\s*\|\s*Shopee Việt Nam\s*$/i, ''), image, canonicalUrl, exists: true };
  } catch (err) {
    log(
      `Không đọc được thông tin sản phẩm: ${err instanceof Error ? err.message : String(err)}`,
    );
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

  // --- Tang 1: chi dung HTTP. Du de ket luan link chet, va khong bao gio bi Shopee chan. ---
  log('Đang phân giải link rút gọn (nếu có)...');
  const resolved = await resolveShortLink(link);
  if (resolved.error) log(`Không phân giải được link qua HTTP: ${resolved.error}`);
  else if (resolved.redirected) log(`Đã phân giải ra: ${resolved.url}`);

  const deadReason = deadLinkReason(link, resolved);
  if (deadReason) {
    log(`Kết luận link chết ngay ở bước HTTP: ${deadReason}`);
    return { link, status: 'dead', message: deadReason };
  }

  // Bo query/tracking khi doc the og: - da do thuc te, giu nguyen query cua link affiliate thi
  // Shopee khong tra ve the og: nao ca.
  let cleanLink = resolved.url;
  try {
    const u = new URL(cleanLink);
    cleanLink = `${u.origin}${u.pathname}`;
  } catch {
    /* giu nguyen */
  }
  cleanLink = toProductUrl(cleanLink);

  let meta = await fetchProductMeta(cleanLink, log);
  // Nguoi dung se XOA bai dua tren nhan nay, nen doi hoi 2 lan doc deu bao khong co san pham
  // truoc khi ket luan - phong truong hop Shopee tra trang chu nhat thoi do bi chan tam thoi.
  if (meta.exists === false) {
    log('Đọc lại lần nữa để chắc chắn trước khi kết luận link chết...');
    await new Promise((r) => setTimeout(r, 1500));
    meta = await fetchProductMeta(cleanLink, log);
  }
  const preview = { title: meta.title, image: meta.image };
  if (meta.exists === false) {
    return {
      link,
      status: 'dead',
      message: 'Sản phẩm không còn tồn tại (Shopee trả về trang chủ thay vì trang sản phẩm)',
    };
  }

  // --- Tang 2: mo trinh duyet, CHI de phan biet con hang / het hang (the og: khong co ton kho). ---

  const hasSession = fs.existsSync(SHOPEE_SESSION_PATH);
  log('Đang mở trang bằng trình duyệt để đọc trạng thái nút mua...');
  const browser = await getShopeeBrowser();
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    locale: 'vi-VN',
    viewport: { width: 1366, height: 900 },
    ...(hasSession ? { storageState: SHOPEE_SESSION_PATH } : {}),
  });
  // Shopee render trang san pham day du roi MOI day sang /verify/traffic (doi dang nhap) sau ~2-3s.
  // Tra 204 cho dieu huong do -> trinh duyet giu nguyen trang san pham, du thoi gian doc nut mua.
  await context.route('**/verify/traffic**', (route) => route.fulfill({ status: 204, body: '' }));
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
    // Dung link GOC chu khong phai link chuan da lam sach: chi khi di qua link affiliate (con
    // credential_token) Shopee moi chiu render trang san pham cho phien chua dang nhap.
    // 'commit' chu khong phai 'networkidle' - cho lau la bi day sang trang dang nhap mat.
    await page.goto(link, { waitUntil: 'commit', timeout: 45_000 });

    // Doi nut mua xuat hien, doc ngay khi co.
    let buttons: { cls: string; aria: string | null }[] = [];
    let bodyText = '';
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(250);
      const snap = await page
        .evaluate((reSrc: string) => {
          const re = new RegExp(reSrc, 'i');
          return {
            text: document.body?.innerText ?? '',
            buttons: [...document.querySelectorAll('button')]
              .filter((b) => re.test(b.textContent ?? ''))
              .map((b) => ({ cls: b.className, aria: b.getAttribute('aria-disabled') })),
          };
        }, BUY_BUTTON_TEXT_RE.source)
        .catch(() => null); // context bi huy giua chung khi trang dieu huong
      if (!snap) continue;
      if (snap.text) bodyText = snap.text.normalize('NFC');
      if (snap.buttons.length > 0) {
        buttons = snap.buttons;
        break;
      }
    }

    if (buttons.length > 0) {
      const enabled = buttons.filter(
        (b) => !DISABLED_CLASS_RE.test(b.cls) && b.aria !== 'true',
      );
      log(
        `Tìm thấy ${buttons.length} nút mua, ${enabled.length} nút đang bật.`,
      );
      return enabled.length > 0
        ? { link, status: 'available', message: 'Còn hàng (nút mua đang bật)', ...preview }
        : {
            link,
            status: 'out_of_stock',
            message: 'Hết hàng (nút mua bị vô hiệu hoá)',
            ...preview,
          };
    }

    // Khong bat duoc nut mua -> xem trang dang o trang thai nao de bao cho dung.
    for (const re of DEAD_PATTERNS) {
      if (re.test(bodyText)) {
        return {
          link,
          status: 'dead',
          message: 'Trang báo sản phẩm không còn tồn tại / đã bị gỡ',
          ...preview,
        };
      }
    }
    for (const re of OUT_OF_STOCK_PATTERNS) {
      if (re.test(bodyText)) {
        return {
          link,
          status: 'out_of_stock',
          message: 'Trang báo hết hàng',
          ...preview,
        };
      }
    }
    if (LOGIN_REQUIRED_PATTERNS.some((re) => re.test(bodyText))) {
      log('Bị Shopee đẩy sang trang đòi đăng nhập trước khi đọc được nút mua.');
      return {
        link,
        status: 'unknown',
        message:
          'Sản phẩm còn tồn tại nhưng chưa đọc được nút mua: bị đẩy sang trang đăng nhập',
        ...preview,
      };
    }
    if (BOT_CHECK_PATTERNS.some((re) => re.test(bodyText))) {
      return {
        link,
        status: 'unknown',
        message: 'Trang yêu cầu xác minh chống bot (captcha) — chưa xác định được trạng thái',
        ...preview,
      };
    }
    const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 500);
    return {
      link,
      status: 'unknown',
      message: `Không tìm thấy nút mua trên trang. Trích nội dung: "${snippet}"`,
      ...preview,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { link, status: 'unknown', message: `Lỗi mở trang: ${msg}`, ...preview };
  } finally {
    await context.close();
  }
}
