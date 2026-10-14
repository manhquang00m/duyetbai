import { Router } from 'express';
import { z } from 'zod';
import { buildInsights } from '../db/insights';

const router = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const QuerySchema = z.object({ from: dateStr, to: dateStr });

// GET /api/insights?from=YYYY-MM-DD&to=YYYY-MM-DD (khoang theo NGAY DANG)
router.get('/', (req, res) => {
  const q = QuerySchema.safeParse(req.query);
  if (!q.success || q.data.from > q.data.to) {
    res.status(400).json({ error: 'Khoảng ngày không hợp lệ' });
    return;
  }
  res.json(buildInsights(q.data.from, q.data.to));
});

export default router;
