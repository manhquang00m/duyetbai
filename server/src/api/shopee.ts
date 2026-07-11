import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { exportShopeeInput, exportPosts } from '../services/exporter';
import { importShopeeLinks } from '../services/importer';
import { db } from '../db';
import { getExportWarnings } from '../db/queries';
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

// GET /api/export/shopee -> tai file link goc + Sub_id
router.get('/export/shopee', async (_req, res, next) => {
  try {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const out = path.join(EXPORT_DIR, 'shopee_input.xlsx');
    await exportShopeeInput(out);
    res.download(out, 'shopee_input.xlsx');
  } catch (err) {
    next(err);
  }
});

// GET /api/export/posts/check -> canh bao truoc khi xuat (chua cap nhat link / >1 comment shopee)
router.get('/export/posts/check', (_req, res) => {
  res.json(getExportWarnings());
});

// GET /api/export/posts -> tai file cuoi cho tool auto dang
router.get('/export/posts', async (_req, res, next) => {
  try {
    fs.mkdirSync(EXPORT_DIR, { recursive: true });
    const out = path.join(EXPORT_DIR, 'posts.xlsx');
    await exportPosts(out);
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
    const origCol = parseCol(req.body?.origCol) ?? 1;
    const newCol = parseCol(req.body?.newCol) ?? 7; // Shopee gen link o cot G
    const result = await importShopeeLinks(filePath, { origCol, newCol });
    res.json(result);
  } catch (err) {
    next(err);
  } finally {
    fs.rm(filePath, { force: true }, () => {});
  }
});

// GET /api/shopee/links -> map link goc/moi de hien thi
router.get('/shopee/links', (_req, res) => {
  const rows = db
    .prepare('SELECT post_id, comment, link, new_link FROM shopee_entries ORDER BY post_id')
    .all();
  res.json(rows);
});

export default router;
