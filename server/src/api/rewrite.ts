import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import {
  createRewriteBatch,
  exportRewriteBatch,
  getBatch,
  getRow,
  listRows,
  rewriteRow,
  saveRewritten,
} from '../services/rewrite';
import { startRewriteJob } from '../services/jobs';
import { EXPORT_DIR } from '../config';

const uploadDir = path.join(EXPORT_DIR, '_rewrite_uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // Chi nhan bang tinh - file khac vao day chi ton dia va chac chan doc loi.
    cb(null, /\.(xlsx|csv)$/i.test(file.originalname || ''));
  },
});

const router = Router();

const errMsg = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).split('\n')[0];

// POST /api/rewrite/upload (multipart: file, srcCol?, destCol?) -> tao batch tu file Excel
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Thiếu file (chỉ nhận .xlsx hoặc .csv, tối đa 10MB)' });
    return;
  }
  const filePath = req.file.path;
  try {
    const srcCol = Number(req.body?.srcCol) || 2; // B = Caption
    const destCol = Number(req.body?.destCol) || 11; // K = caption goc
    const result = await createRewriteBatch(filePath, req.file.originalname || 'caption.xlsx', {
      srcCol,
      destCol,
    });
    if (result.total === 0) {
      res.status(400).json({ error: 'Không đọc được caption nào ở cột đã chọn' });
      return;
    }
    res.json(result);
  } catch (err) {
    fs.rm(filePath, { force: true }, () => {}); // tao batch that bai -> khong ai dung file nay nua
    res.status(400).json({ error: `Không đọc được file: ${errMsg(err)}` });
  }
});

// GET /api/rewrite/:batchId -> danh sach dong (goc + ban viet lai)
router.get('/:batchId', (req, res) => {
  const batch = getBatch(req.params.batchId);
  if (!batch) {
    res.status(404).json({ error: 'Không tìm thấy batch' });
    return;
  }
  res.json({
    batchId: batch.batch_id,
    fileName: batch.file_name,
    srcCol: batch.src_col,
    destCol: batch.dest_col,
    rows: listRows(batch.batch_id),
  });
});

// POST /api/rewrite/:batchId/run -> chay AI cho ca batch (job nen, tien trinh qua /api/batch/:id/stream)
router.post('/:batchId/run', (req, res) => {
  const batch = getBatch(req.params.batchId);
  if (!batch) {
    res.status(404).json({ error: 'Không tìm thấy batch' });
    return;
  }
  const job = startRewriteJob(batch.batch_id);
  if (job.total === 0) {
    res.status(400).json({ error: 'Batch không có dòng nào để viết lại' });
    return;
  }
  res.status(202).json({ jobId: job.id, total: job.total });
});

// POST /api/rewrite/rows/:id/run -> viet lai dung 1 dong
router.post('/rows/:id/run', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || !getRow(id)) {
    res.status(404).json({ error: 'Không tìm thấy dòng' });
    return;
  }
  const r = await rewriteRow(id);
  if (!r.ok) {
    res.status(502).json({ error: r.error });
    return;
  }
  res.json({ rewritten: r.text });
});

// PATCH /api/rewrite/rows/:id { rewritten } -> luu ban sua tay
router.patch('/rows/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || !getRow(id)) {
    res.status(404).json({ error: 'Không tìm thấy dòng' });
    return;
  }
  const text = typeof req.body?.rewritten === 'string' ? req.body.rewritten : null;
  if (text == null) {
    res.status(400).json({ error: 'Thiếu nội dung' });
    return;
  }
  saveRewritten(id, text);
  res.json({ ok: true });
});

// GET /api/rewrite/:batchId/export -> tai file Excel moi (cot B = ban viet lai, cot K = caption goc)
router.get('/:batchId/export', async (req, res) => {
  try {
    // Duong dan file LUON tra ve tu DB theo batchId, khong bao gio nhan path tu client.
    const out = await exportRewriteBatch(req.params.batchId);
    res.download(out.path, out.name);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

export default router;
