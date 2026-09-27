import { Router } from 'express';
import { z } from 'zod';
import { dayReport, accountRange } from '../db/postRuns';

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

export default router;
