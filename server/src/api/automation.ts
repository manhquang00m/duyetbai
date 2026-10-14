import { timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { recordPostRuns } from '../db/postRuns';
import { recordViolations } from '../db/violations';
import { AUTOMATION_API_KEY } from '../config';

// API cho tool auto dang goi vao (khong phai UI). Bat buoc header X-Api-Key = AUTOMATION_API_KEY.

const router = Router();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Fail closed: chua cau hinh key -> tu choi het, khong bao gio "mo" mac dinh. */
const requireApiKey: RequestHandler = (req, res, next) => {
  if (!AUTOMATION_API_KEY) {
    res.status(503).json({ error: 'Server chưa cấu hình AUTOMATION_API_KEY' });
    return;
  }
  // Bo khoang trang/xuong dong thua o 2 dau - loi hay gap khi tool doc key tu file.
  const got = (req.get('x-api-key') ?? '').trim();
  if (!got) {
    console.warn('[automation] 401: request KHONG co header X-Api-Key');
    res.status(401).json({ error: 'Thiếu header X-Api-Key' });
    return;
  }
  if (!safeEqual(got, AUTOMATION_API_KEY)) {
    // Khong ghi gia tri key vao log - chi ghi ly do.
    console.warn('[automation] 401: X-Api-Key KHONG khop AUTOMATION_API_KEY trong server/.env');
    res.status(401).json({ error: 'X-Api-Key không khớp với AUTOMATION_API_KEY của server' });
    return;
  }
  next();
};

// Chap nhan 'YYYY-MM-DD HH:MM[:SS]' hoac ISO 'YYYY-MM-DDTHH:MM[:SS]...' -> chuan hoa ve
// 'YYYY-MM-DD HH:MM:SS' (gio cua may chay tool, khong doi mui gio).
const dateTimeStr = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/)
  .transform((s) => {
    const [d, t] = s.replace('T', ' ').split(' ');
    const hms = t.slice(0, 8);
    return `${d} ${hms.length === 5 ? `${hms}:00` : hms}`;
  });

const ResultSchema = z.object({
  accountName: z.string().trim().min(1).max(120),
  postId: z.string().trim().regex(/^[A-Za-z0-9_-]{1,80}$/),
  postDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['posted', 'commented']),
  postedUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\//)
    .nullish(),
  postedAt: dateTimeStr.nullish(),
});

const BodySchema = z.object({ results: z.array(ResultSchema).min(1).max(200) });

// Tool auto viet bang nhieu cong cu khac nhau -> chap nhan cac kieu gui pho bien thay vi bat tool
// sua: JSON (ke ca gui voi Content-Type text/plain), form-urlencoded; va 3 dang body:
//   { results: [...] }  |  [ {...}, {...} ]  |  { accountName, postId, ... } (1 dong)
// express.json() toan cuc chi doc application/json -> them 2 parser rieng cho router nay.
router.use(express.text({ type: 'text/plain', limit: '200kb' }));
router.use(express.urlencoded({ extended: false, limit: '200kb' }));

/** Body la chuoi nhung khong parse duoc JSON (vd dung nhay don '...', bien chua duoc thay). */
class InvalidJsonBody extends Error {}

function normalizeBody(raw: unknown): unknown {
  let b = raw;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch (err) {
      throw new InvalidJsonBody(err instanceof Error ? err.message : 'JSON lỗi');
    }
  }
  if (Array.isArray(b)) return { results: b };
  if (b && typeof b === 'object') {
    const o = b as Record<string, unknown>;
    // form gui results la chuoi JSON
    if (typeof o.results === 'string') {
      try {
        return { results: JSON.parse(o.results) };
      } catch {
        return o;
      }
    }
    if (!('results' in o) && ('accountName' in o || 'postId' in o)) return { results: [o] };
  }
  return b;
}

/** Chuan hoa + validate body; loi thi tu tra 400 va tra ve null. */
function parseBody<T extends z.ZodTypeAny>(req: Request, res: Response, schema: T): z.infer<T> | null {
  let normalized: unknown;
  try {
    normalized = normalizeBody(req.body);
  } catch (err) {
    const detail = err instanceof InvalidJsonBody ? err.message : 'JSON lỗi';
    console.warn(`[automation] 400: body KHONG phai JSON hop le (${detail})`);
    res.status(400).json({
      error: `Body không phải JSON hợp lệ: ${detail}. Kiểm tra: chỉ dùng nháy kép "...", biến đã được thay giá trị, không thừa dấu phẩy.`,
    });
    return null;
  }
  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    // Chi log Content-Type + TEN cac truong nhan duoc (khong log gia tri) - du de biet tool gui sai gi.
    const body = req.body as unknown;
    const shape =
      typeof body === 'string'
        ? `chuoi ${body.length} ky tu`
        : body && typeof body === 'object'
          ? `cac truong: [${Object.keys(body).join(', ')}]`
          : String(typeof body);
    console.warn(
      `[automation] 400: Content-Type="${req.get('content-type') ?? ''}", body ${shape}, loi: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(body)'} ${i.message}`)
        .join('; ')}`,
    );
    res.status(400).json({
      error: 'Dữ liệu không hợp lệ',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return null;
  }
  return parsed.data;
}

/**
 * POST /api/automation/post-results
 * Header: X-Api-Key: <AUTOMATION_API_KEY>
 * Body: { results: [{ accountName, postId, postDate, status: 'posted'|'commented', postedUrl?, postedAt? }] }
 * Goi lai cung slot (postDate + accountName + postId) an toan: ghi de, chi nang trang thai.
 */
router.post('/post-results', requireApiKey, (req, res) => {
  const data = parseBody(req, res, BodySchema);
  if (!data) return;
  res.json({ results: recordPostRuns(data.results) });
});

const pad = (n: number) => String(n).padStart(2, '0');

// Ngay dang bai doc tu giao dien Threads tieng Viet: "10 tháng 10, 2026" -> '2026-10-10'.
// Nhan them 'YYYY-MM-DD'. NFC vi chu "á" tu tool co the o dang to hop (a + dau).
const viDate = z
  .string()
  .trim()
  .max(40)
  .transform((s, ctx) => {
    const t = s.normalize('NFC');
    const vi = t.match(/^(\d{1,2})\s+tháng\s+(\d{1,2}),?\s+(\d{4})$/iu);
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const parts = vi ? [vi[3], vi[2], vi[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
    if (!parts) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cần dạng '10 tháng 10, 2026' hoặc YYYY-MM-DD" });
      return z.NEVER;
    }
    const [y, m, d] = parts.map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ngày không tồn tại' });
      return z.NEVER;
    }
    return `${y}-${pad(m)}-${pad(d)}`;
  });

const ViolationSchema = z.object({
  accountName: z.string().trim().min(1).max(120),
  detectedAt: dateTimeStr.nullish(),
  postedAt: viDate.nullish(),
  postId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,80}$/)
    .nullish(),
  postedUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\//)
    .nullish(),
  message: z.string().trim().max(300).nullish(),
});

const ViolationBodySchema = z.object({ results: z.array(ViolationSchema).min(1).max(200) });

/** Gio local cua server, 'YYYY-MM-DD HH:MM:SS' - dung khi tool khong gui detectedAt. */
function localNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/**
 * POST /api/automation/violations
 * Header: X-Api-Key: <AUTOMATION_API_KEY>
 * Body: { results: [{ accountName, detectedAt?, postedAt?, postId?, postedUrl?, message? }] }
 * postedAt: ngay dang bai, vd "10 tháng 10, 2026".
 * Gui lai cung (ngay, nick, bai) -> chi tang so lan bao, khong sinh dong moi.
 */
router.post('/violations', requireApiKey, (req, res) => {
  const data = parseBody(req, res, ViolationBodySchema);
  if (!data) return;
  const items = data.results.map((v) => ({ ...v, detectedAt: v.detectedAt ?? localNow() }));
  res.json({ results: recordViolations(items) });
});

export default router;
