import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import {
  listPosts,
  getPostDetail,
  deletePost,
  listRejectedPosts,
  listBacklogPostIds,
  REJECT_REASONS,
  type PostSort,
} from '../db/queries';
import { markPostsPosted } from '../db/repository';
import {
  startRescrapeJob,
  startBeautifyJob,
  startShopeeLinkCheckJob,
  startPostPipelineJob,
} from '../services/jobs';
import { BeautifyConfigSchema } from '../services/beautify';
import { parsePostFilterQuery } from '../utils/postFilters';
import { DOWNLOAD_DIR } from '../config';

const router = Router();

// Upload anh watermark (tuy chon) cho tinh nang "lam dep video"
const watermarkUploadDir = path.join(DOWNLOAD_DIR, '_uploads');
fs.mkdirSync(watermarkUploadDir, { recursive: true });
const uploadWatermark = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
  storage: multer.diskStorage({
    destination: watermarkUploadDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
  }),
});

// GET /api/posts?search=&limit=&offset=&noShopee=1&notUpdated=1&postStatus=unposted|posted&mediaFilter=complete|missing|imageOnly|videoOnly
router.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 200);
  const offset = Number(req.query.offset ?? 0) || 0;
  const sortRaw = String(req.query.sort ?? '');
  const sort: PostSort | undefined = (['likes', 'clicks', 'posted'] as const).find((s) => s === sortRaw);
  res.json(listPosts({ ...parsePostFilterQuery(req.query as Record<string, unknown>), limit, offset, sort }));
});

// POST /api/posts/mark-posted { postIds: string[], posted?: boolean } -> danh dau (hoac bo danh dau) da dang
router.post('/mark-posted', (req, res) => {
  const postIds = (Array.isArray(req.body?.postIds) ? req.body.postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  if (postIds.length === 0) {
    res.status(400).json({ error: 'thieu postIds' });
    return;
  }
  const posted = req.body?.posted !== false;
  markPostsPosted(postIds, posted);
  res.json({ updated: postIds.length, posted });
});

// POST /api/posts/rescrape { postIds: string[] } -> cao lai comment (job nen)
router.post('/rescrape', (req, res) => {
  const postIds = (Array.isArray(req.body?.postIds) ? req.body.postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  if (postIds.length === 0) {
    res.status(400).json({ error: 'thieu postIds' });
    return;
  }
  const job = startRescrapeJob(postIds);
  res.status(202).json({ jobId: job.id, total: job.total });
});

// POST /api/posts/check-shopee-links { postIds: string[] } -> kiem tra tinh trang link Shopee cua
// cac bai da chon (job nen, xem tien trinh qua GET /api/batch/:id/stream)
router.post('/check-shopee-links', (req, res) => {
  const postIds = (Array.isArray(req.body?.postIds) ? req.body.postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  if (postIds.length === 0) {
    res.status(400).json({ error: 'thieu postIds' });
    return;
  }
  const job = startShopeeLinkCheckJob({ postIds });
  if (job.total === 0) {
    res.status(400).json({ error: 'Các bài đã chọn không có link Shopee nào để kiểm tra' });
    return;
  }
  res.status(202).json({ jobId: job.id, total: job.total });
});

/** Xoa bai (FK cascade media/shopee_entries/variants) + folder media da tai. */
function deletePostsWithMedia(postIds: string[]): void {
  for (const id of postIds) {
    deletePost(id);
    fs.rm(path.join(DOWNLOAD_DIR, `post_${id}`), { recursive: true, force: true }, () => {});
  }
}

const MAX_PIPELINE_IDS = 5000;
// post_id la shortcode Threads (chu/so/_/-) - chan gia tri la truoc khi dung lam ten thu muc.
const POST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** postIds tu body: undefined neu khong gui; null neu sai kieu / qua dai / co id khong hop le. */
function readPostIds(raw: unknown): string[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length > MAX_PIPELINE_IDS) return null;
  const ids = raw.map((s) => (typeof s === 'string' ? s.trim() : ''));
  return ids.every((id) => POST_ID_RE.test(id)) ? [...new Set(ids)] : null;
}

// POST /api/posts/delete { postIds: string[] } -> xoa bai + folder media
router.post('/delete', (req, res) => {
  const postIds = (Array.isArray(req.body?.postIds) ? req.body.postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  deletePostsWithMedia(postIds);
  res.json({ deleted: postIds.length });
});

// POST /api/posts/delete-rejected { postIds?: string[] } -> xoa bai BI LOAI (khong link / link chet /
// het hang / can xem lai, chua dang). Danh sach do SERVER tinh lai theo REJECT_COND - postIds chi
// thu hep pham vi (vd bai cua 1 lan cao), gui kem bai dat cung khong xoa nham.
router.post('/delete-rejected', (req, res) => {
  const postIds = readPostIds(req.body?.postIds);
  if (postIds === null) {
    res.status(400).json({ error: 'postIds không hợp lệ' });
    return;
  }
  const rows = listRejectedPosts(postIds);
  deletePostsWithMedia(rows.map((r) => r.post_id));
  const byReason = Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<string, number>;
  for (const r of rows) byReason[r.reason]++;
  res.json({ deleted: rows.length, byReason });
});

// POST /api/posts/pipeline { postIds?: string[], scope?: 'backlog', checkLinks?, rewrite? }
// -> luong tu dong (kiem tra link -> phan loai -> viet lai), job nen. scope=backlog: moi bai chua dang.
router.post('/pipeline', (req, res) => {
  const postIds = readPostIds(req.body?.postIds);
  if (postIds === null) {
    res.status(400).json({ error: 'postIds không hợp lệ' });
    return;
  }
  const ids = req.body?.scope === 'backlog' ? listBacklogPostIds() : (postIds ?? []);
  if (ids.length === 0) {
    res.status(400).json({ error: 'Không có bài nào để xử lý' });
    return;
  }
  const job = startPostPipelineJob(ids, {
    checkLinks: req.body?.checkLinks !== false,
    rewrite: req.body?.rewrite !== false,
  });
  res.status(202).json({ jobId: job.id, total: job.total });
});

// POST /api/posts/beautify (multipart: postIds, config = JSON string, watermarkImage? = file)
// -> lam dep toan bo video cua cac bai da chon (watermark/filter mau/crop-xoay/toc do), job nen
router.post('/beautify', uploadWatermark.single('watermarkImage'), (req, res) => {
  let postIds: unknown;
  let rawConfig: unknown;
  try {
    postIds = JSON.parse(String(req.body?.postIds ?? '[]'));
    rawConfig = JSON.parse(String(req.body?.config ?? '{}'));
  } catch {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    res.status(400).json({ error: 'postIds/config khong dung dinh dang JSON' });
    return;
  }

  const ids = (Array.isArray(postIds) ? postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  if (ids.length === 0) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    res.status(400).json({ error: 'thieu postIds' });
    return;
  }

  const parsed = BeautifyConfigSchema.safeParse(rawConfig);
  if (!parsed.success) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    res.status(400).json({ error: `config khong hop le: ${parsed.error.message}` });
    return;
  }

  const job = startBeautifyJob(ids, parsed.data, req.file?.path);
  if (job.total === 0) {
    res.status(400).json({ error: 'Không tìm thấy video nào trong các bài đã chọn' });
    return;
  }
  res.status(202).json({ jobId: job.id, total: job.total });
});

// GET /api/posts/:id
router.get('/:id', (req, res) => {
  const detail = getPostDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: 'khong tim thay bai' });
    return;
  }
  res.json(detail);
});

export default router;
