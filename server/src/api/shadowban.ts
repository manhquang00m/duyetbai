import { Router } from 'express';
import { startShadowbanCheckJob } from '../services/jobs';
import { listShadowbanChecks, viewHistory } from '../db/shadowban';

const router = Router();

// POST /api/shadowban/check { accounts: string[] } -> job nen, xem tien trinh qua
// GET /api/batch/:id/stream (dung chung job store trong jobs.ts)
router.post('/check', (req, res) => {
  const accounts = (Array.isArray(req.body?.accounts) ? req.body.accounts : [])
    .map((s: unknown) => String(s).trim())
    .filter(Boolean);
  if (accounts.length === 0) {
    res.status(400).json({ error: 'thieu accounts' });
    return;
  }
  const job = startShadowbanCheckJob(accounts);
  res.status(202).json({ jobId: job.id, total: job.total });
});

// GET /api/shadowban/history/:account -> cac lan check + lich su view tung bai
router.get('/history/:account', (req, res) => {
  const name = req.params.account;
  res.json({ checks: listShadowbanChecks(name), views: viewHistory(name) });
});

export default router;
