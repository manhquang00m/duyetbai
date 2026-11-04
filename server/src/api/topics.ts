import { Router, type Response } from 'express';
import { createTopic, deleteTopic, listTopics, renameTopic, reorderTopics, TopicError } from '../db/topics';

const router = Router();

/** Loi nghiep vu (trung ten, ten rong...) -> 400 kem thong diep tieng Viet; loi khac de middleware xu ly. */
function handle(res: Response, fn: () => void): void {
  try {
    fn();
    res.json(listTopics());
  } catch (err) {
    if (err instanceof TopicError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

// GET /api/topics -> danh muc chu de theo thu tu + so bai/account dang dung
router.get('/', (_req, res) => {
  res.json(listTopics());
});

// POST /api/topics { name } -> them (xep cuoi)
router.post('/', (req, res) => {
  handle(res, () => createTopic(req.body?.name));
});

// PUT /api/topics/order { names: string[] } -> ghi lai thu tu hien thi
router.put('/order', (req, res) => {
  const names = (Array.isArray(req.body?.names) ? req.body.names : []).map((n: unknown) => String(n));
  handle(res, () => reorderTopics(names));
});

// PUT /api/topics/:name { name } -> doi ten (keo theo bai/account/lich su phan phoi)
router.put('/:name', (req, res) => {
  handle(res, () => renameTopic(req.params.name, req.body?.name));
});

// DELETE /api/topics/:name -> xoa + bo gan khoi bai/account dang dung
router.delete('/:name', (req, res) => {
  handle(res, () => deleteTopic(req.params.name));
});

export default router;
