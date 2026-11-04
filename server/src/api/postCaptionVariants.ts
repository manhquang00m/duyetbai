import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import {
  listVariantStatus,
  listVariantsForPost,
  generateVariantsForPost,
  exportVariantsXlsx,
  importVariantsXlsx,
} from '../services/postCaptionVariants';
import { startCaptionVariantJob } from '../services/jobs';
import { fileStamp } from '../utils/fileStamp';
import { EXPORT_DIR } from '../config';

const uploadDir = path.join(EXPORT_DIR, '_variant_uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /\.xlsx$/i.test(file.originalname || '')),
});

const router = Router();

// GET /api/post-caption-variants/status -> bai hop le + so ban da co (bai thieu ban len dau)
router.get('/status', (_req, res) => {
  res.json(listVariantStatus());
});

// POST /api/post-caption-variants/run { postIds?: string[] } -> chay job nen (mac dinh: bai thieu ban)
router.post('/run', (req, res) => {
  const ids = Array.isArray(req.body?.postIds)
    ? (req.body.postIds as unknown[]).map(String)
    : undefined;
  const job = startCaptionVariantJob(ids);
  if (job.total === 0) {
    res.status(400).json({ error: 'Không có bài nào cần viết lại' });
    return;
  }
  res.status(202).json({ jobId: job.id, total: job.total });
});

// GET /api/post-caption-variants/export?scope=missing|all -> file caption goc de viet lai ngoai app
router.get('/export', async (req, res, next) => {
  try {
    const scope = req.query.scope === 'all' ? 'all' : 'missing';
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const out = path.join(EXPORT_DIR, 'caption_variants_export.xlsx');
    await exportVariantsXlsx(out, scope);
    res.download(out, `viet_lai_caption_${scope === 'all' ? 'tat_ca' : 'con_thieu'}_${fileStamp()}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// POST /api/post-caption-variants/import (multipart: file .xlsx) -> luu 3 ban da viet lai ngoai app
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Thiếu file (chỉ nhận .xlsx, tối đa 10MB)' });
    return;
  }
  const filePath = req.file.path;
  try {
    res.json(await importVariantsXlsx(filePath));
  } catch {
    res.status(400).json({ error: 'Không đọc được file — cần file .xlsx đúng mẫu đã xuất' });
  } finally {
    fs.rm(filePath, { force: true }, () => {});
  }
});

// GET /api/post-caption-variants/:postId -> 3 ban caption da viet cho bai nay (rong neu chua co)
router.get('/:postId', (req, res) => {
  res.json(listVariantsForPost(req.params.postId));
});

// POST /api/post-caption-variants/:postId/run -> viet lai (hoac viet lai lai) dung 1 bai
router.post('/:postId/run', async (req, res) => {
  const r = await generateVariantsForPost(req.params.postId, true);
  if (!r.ok) {
    res.status(400).json({ error: r.error });
    return;
  }
  res.json({ ok: true });
});

export default router;
