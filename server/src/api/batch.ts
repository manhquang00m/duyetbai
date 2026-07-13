import { Router } from 'express';
import { startBatchJob, getJob, subscribe } from '../services/jobs';
import { listCollectHistory, removeCollectHistory } from '../db/history';

const router = Router();

// POST /api/batch  { urls: string[] }
router.post('/', (req, res) => {
  const raw = Array.isArray(req.body?.urls) ? req.body.urls : [];
  const urls = raw.map((u: unknown) => String(u).trim()).filter((u: string) => u && !u.startsWith('#'));
  if (urls.length === 0) {
    res.status(400).json({ error: 'thieu urls' });
    return;
  }
  const force = Boolean(req.body?.force);
  const job = startBatchJob(urls, force);
  res.status(202).json({ jobId: job.id, total: job.total });
});

// GET /api/batch/history?onlyFailed=1 -> lich su tat ca URL da tung thu thu thap
router.get('/history', (req, res) => {
  const onlyFailed = req.query.onlyFailed === '1' || req.query.onlyFailed === 'true';
  res.json(listCollectHistory({ onlyFailed }));
});

// DELETE /api/batch/history/:id -> xoa 1 dong lich su
router.delete('/history/:id', (req, res) => {
  removeCollectHistory(Number(req.params.id));
  res.json({ ok: true });
});

// GET /api/batch/:id  -> trang thai hien tai
router.get('/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'khong tim thay job' });
    return;
  }
  res.json(job);
});

// GET /api/batch/:id/stream  -> SSE tien trinh
router.get('/:id/stream', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // day trang thai hien tai truoc
  send({ type: 'progress', job });
  if (job.status !== 'running') {
    send({ type: 'end', job });
    res.end();
    return;
  }

  const unsub = subscribe(req.params.id, (event) => {
    send(event);
    if (event.type === 'end') res.end();
  });
  req.on('close', unsub);
});

export default router;
