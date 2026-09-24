import { Router } from 'express';
import {
  listVariantStatus,
  listVariantsForPost,
  generateVariantsForPost,
} from '../services/postCaptionVariants';
import { startCaptionVariantJob } from '../services/jobs';

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
