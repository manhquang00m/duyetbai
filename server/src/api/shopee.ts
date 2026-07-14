import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { exportShopeeInput, exportPosts } from '../services/exporter';
import { importShopeeLinks } from '../services/importer';
import { db } from '../db';
import { getExportWarnings } from '../db/queries';
import { startShopeeLinkCheckJob } from '../services/jobs';
import { checkShopeeLink } from '../services/shopeeLinkCheck';
import { EXPORT_DIR } from '../config';

const uploadDir = path.join(EXPORT_DIR, '_uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

const router = Router();

const parseCol = (v: unknown): string | number | undefined => {
  if (v == null || v === '') return undefined;
  const s = String(v);
  return /^\d+$/.test(s) ? Number(s) : s;
};

// GET /api/export/shopee?onlyMissing=1 -> tai file link goc + Sub_id (onlyMissing: bo qua link da co new_link)
router.get('/export/shopee', async (req, res, next) => {
  try {
    const onlyMissing = req.query.onlyMissing === '1' || req.query.onlyMissing === 'true';
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const out = path.join(EXPORT_DIR, 'shopee_input.xlsx');
    await exportShopeeInput(out, { onlyMissing });
    res.download(out, 'shopee_input.xlsx');
  } catch (err) {
    next(err);
  }
});

// GET /api/export/posts/check -> canh bao truoc khi xuat (chua cap nhat link / >1 comment shopee)
router.get('/export/posts/check', (_req, res) => {
  res.json(getExportWarnings());
});

// GET /api/export/posts?onlyUnposted=1&onlyCompleteMedia=1 -> tai file cuoi cho tool auto dang
router.get('/export/posts', async (req, res, next) => {
  try {
    const onlyUnposted = req.query.onlyUnposted === '1' || req.query.onlyUnposted === 'true';
    const onlyCompleteMedia =
      req.query.onlyCompleteMedia === '1' || req.query.onlyCompleteMedia === 'true';
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const out = path.join(EXPORT_DIR, 'posts.xlsx');
    await exportPosts(out, { onlyUnposted, onlyCompleteMedia });
    res.download(out, 'posts.xlsx');
  } catch (err) {
    next(err);
  }
});

// POST /api/import/shopee (multipart: file) -> cap nhat new_link
router.post('/import/shopee', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    res.status(400).json({ error: 'thieu file' });
    return;
  }
  const filePath = req.file.path;
  try {
    const origCol = parseCol(req.body?.origCol) ?? 1; // A: Lien ket chinh
    const newCol = parseCol(req.body?.newCol) ?? 7; // G: Lien ket chuyen doi
    const subIdCol = parseCol(req.body?.subIdCol) ?? 2; // B: Sub_id1 (= POST_ID)
    const isCsv = /\.csv$/i.test(req.file.originalname || '');
    const result = await importShopeeLinks(filePath, { origCol, newCol, subIdCol, isCsv });
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    fs.rm(filePath, { force: true }, () => {});
  }
});

// GET /api/shopee/links -> map link goc/moi + trang thai kiem tra de hien thi
router.get('/shopee/links', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, post_id, comment, link, new_link, link_status, link_message, link_checked_at,
              product_title, product_image
         FROM shopee_entries ORDER BY post_id`,
    )
    .all();
  res.json(rows);
});

// POST /api/shopee/links/check-job { entryIds?: number[] } -> kiem tra link Shopee (con hang/het
// hang/khong ton tai), chay job nen, xem tien trinh qua GET /api/batch/:id/stream (dung chung job store).
// Co entryIds -> chi kiem tra cac dong da chon (chi xet new_link). Khong co -> kiem tra tat ca.
router.post('/shopee/links/check-job', (req, res) => {
  const raw = req.body?.entryIds;
  const entryIds = Array.isArray(raw)
    ? raw.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
    : undefined;
  if (entryIds && entryIds.length === 0) {
    res.status(400).json({ error: 'thieu entryIds' });
    return;
  }
  const job = startShopeeLinkCheckJob({ entryIds });
  if (job.total === 0) {
    res.status(400).json({
      error: entryIds
        ? 'Các dòng đã chọn chưa có link mới (new_link) để kiểm tra'
        : 'Không có link Shopee nào để kiểm tra',
    });
    return;
  }
  res.status(202).json({ jobId: job.id, total: job.total });
});

// POST /api/shopee/check-link { link: string } -> kiem tra nhanh 1 link Shopee bat ky (khong
// can nam trong DB, khong luu ket qua) - dung cho o nhap link ngoai tren UI.
router.post('/shopee/check-link', async (req, res, next) => {
  try {
    const link = String(req.body?.link ?? '').trim();
    if (!link) {
      res.status(400).json({ error: 'thieu link' });
      return;
    }
    const result = await checkShopeeLink(link);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
