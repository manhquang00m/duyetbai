import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ACCOUNT_TOPICS } from '../db/accountTopics';
import { affSummary, affPostStats, affAccountStats, affPostDetail, affCoverage, type AffFilter } from '../db/affiliate';
import { importAffiliateCsv, AffImportError, type AffImportResult } from '../services/affiliateImport';
import { EXPORT_DIR } from '../config';

const router = Router();

const uploadDir = path.join(EXPORT_DIR, '_uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => cb(null, /\.csv$/i.test(file.originalname)),
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const FilterSchema = z.object({
  from: dateStr,
  to: dateStr,
  topics: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : []))
    .pipe(z.array(z.enum(ACCOUNT_TOPICS))),
});

function parseFilter(query: unknown): AffFilter | null {
  const r = FilterSchema.safeParse(query);
  if (!r.success || r.data.from > r.data.to) return null;
  return r.data;
}

// POST /api/affiliate/import (multipart, field "files", 1..10 file .csv) -> tu nhan loai tung file
router.post('/import', upload.array('files', 10), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ error: 'Chưa chọn file .csv nào' });
    return;
  }
  const results: (AffImportResult | { fileName: string; error: string })[] = [];
  try {
    // Tuan tu: file hoa hong can doi chieu click cua file click cung dot -> chay xong ca 2 roi
    // resolveLinks() lan cuoi van noi du (moi lan import deu doi chieu lai toan bo).
    for (const f of files) {
      try {
        results.push(await importAffiliateCsv(f.path, f.originalname));
      } catch (err) {
        const msg = err instanceof AffImportError ? err.message : 'Lỗi đọc file';
        if (!(err instanceof AffImportError)) console.error('[affiliate import]', err);
        results.push({ fileName: f.originalname, error: msg });
      }
    }
  } finally {
    for (const f of files) fs.rm(f.path, { force: true }, () => {});
  }
  res.json(results);
});

router.get('/summary', (req, res) => {
  const f = parseFilter(req.query);
  if (!f) {
    res.status(400).json({ error: 'Khoảng ngày không hợp lệ' });
    return;
  }
  res.json(affSummary(f));
});

router.get('/posts', (req, res) => {
  const f = parseFilter(req.query);
  if (!f) {
    res.status(400).json({ error: 'Khoảng ngày không hợp lệ' });
    return;
  }
  res.json(affPostStats(f));
});

router.get('/accounts', (req, res) => {
  const f = parseFilter(req.query);
  if (!f) {
    res.status(400).json({ error: 'Khoảng ngày không hợp lệ' });
    return;
  }
  res.json(affAccountStats(f));
});

router.get('/posts/:postId', (req, res) => {
  const f = parseFilter(req.query);
  const postId = String(req.params.postId);
  if (!f || !/^[A-Za-z0-9_-]{1,64}$/.test(postId)) {
    res.status(400).json({ error: 'Tham số không hợp lệ' });
    return;
  }
  res.json(affPostDetail(postId, f));
});

router.get('/coverage', (_req, res) => {
  res.json(affCoverage());
});

export default router;
