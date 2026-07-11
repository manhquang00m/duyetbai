import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { listPosts, getPostDetail, deletePost } from '../db/queries';
import { startRescrapeJob, startBeautifyJob } from '../services/jobs';
import { BeautifyConfigSchema } from '../services/beautify';
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

// GET /api/posts?search=&limit=&offset=&noShopee=1&notUpdated=1
router.get('/', (req, res) => {
  const search = String(req.query.search ?? '');
  const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
  const offset = Number(req.query.offset ?? 0) || 0;
  const noShopee = req.query.noShopee === '1' || req.query.noShopee === 'true';
  const notUpdated = req.query.notUpdated === '1' || req.query.notUpdated === 'true';
  const oneShopee = req.query.oneShopee === '1' || req.query.oneShopee === 'true';
  res.json(listPosts({ search, limit, offset, noShopee, notUpdated, oneShopee }));
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

// POST /api/posts/delete { postIds: string[] } -> xoa bai + folder media
router.post('/delete', (req, res) => {
  const postIds = (Array.isArray(req.body?.postIds) ? req.body.postIds : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  for (const id of postIds) {
    deletePost(id);
    fs.rm(path.join(DOWNLOAD_DIR, `post_${id}`), { recursive: true, force: true }, () => {});
  }
  res.json({ deleted: postIds.length });
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
