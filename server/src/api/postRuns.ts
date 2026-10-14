import { Router } from 'express';
import { z } from 'zod';
import { dayReport, accountRange } from '../db/postRuns';
import { listViolations, resolveViolation } from '../db/violations';

// Doc nhat ky dang bai cho UI (trang "Nhat ky dang").

const router = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// GET /api/post-runs/day?date=YYYY-MM-DD
router.get('/day', (req, res) => {
  const d = dateStr.safeParse(req.query.date);
  if (!d.success) {
    res.status(400).json({ error: 'Ngày không hợp lệ' });
    return;
  }
  res.json(dayReport(d.data));
});

// GET /api/post-runs/accounts?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/accounts', (req, res) => {
  const f = dateStr.safeParse(req.query.from);
  const t = dateStr.safeParse(req.query.to);
  if (!f.success || !t.success || f.data > t.data) {
    res.status(400).json({ error: 'Khoảng ngày không hợp lệ' });
    return;
  }
  res.json(accountRange(f.data, t.data));
});

// GET /api/post-runs/violations - moi vi pham, moi nhat truoc
router.get('/violations', (_req, res) => {
  res.json(listViolations());
});

// POST /api/post-runs/violations/:id/resolve - nguoi van hanh danh dau da go vi pham
router.post('/violations/:id/resolve', (req, res) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: 'Mã vi phạm không hợp lệ' });
    return;
  }
  if (!resolveViolation(id.data)) {
    res.status(404).json({ error: 'Không tìm thấy vi phạm đang mở' });
    return;
  }
  res.json({ ok: true });
});

export default router;
