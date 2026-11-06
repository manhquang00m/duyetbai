import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  buildSeedingPlan,
  listSeedingCandidates,
  seedingXlsxBuffer,
  SEEDING_MAX_COMMENTS,
  SEEDING_MAX_PER_ROW,
} from '../services/seeding';
import { fileStamp } from '../utils/fileStamp';

const router = Router();

const PlanSchema = z.object({
  accountIds: z.array(z.number().int().positive()).min(1).max(5000),
  perRow: z.number().int().min(1).max(SEEDING_MAX_PER_ROW),
  commentsPerRow: z.number().int().min(0).max(SEEDING_MAX_COMMENTS),
  seed: z.number().int().min(0).max(0xffffffff),
});

function parsePlan(req: Request, res: Response) {
  const parsed = PlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Tham số không hợp lệ' });
    return null;
  }
  return parsed.data;
}

// GET /api/seeding/candidates -> account dang chay (kem ly do neu ten khong dung duoc)
router.get('/candidates', (_req, res) => {
  res.json(listSeedingCandidates());
});

// POST /api/seeding/preview { accountIds, perRow, commentsPerRow, seed } -> bang A/B/C
router.post('/preview', (req, res) => {
  const opts = parsePlan(req, res);
  if (!opts) return;
  res.json(buildSeedingPlan(opts));
});

// POST /api/seeding/export (cung body) -> file xlsx, cung seed nen trung khop ban xem truoc
router.post('/export', async (req, res, next) => {
  const opts = parsePlan(req, res);
  if (!opts) return;
  try {
    const buf = await seedingXlsxBuffer(buildSeedingPlan(opts));
    res.attachment(`seeding_${fileStamp()}.xlsx`);
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

export default router;
