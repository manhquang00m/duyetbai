import { Router } from 'express';
import { listAccountTopics, setAccountTopics } from '../db/accountTopics';

const router = Router();

// GET /api/account-topics -> tung tac gia (username) tung xuat hien + chu de dang gan + so bai
router.get('/', (_req, res) => {
  res.json(listAccountTopics());
});

// POST /api/account-topics { items: [{username, topic}] } -> luu (topic rong = xoa gan)
router.post('/', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  setAccountTopics(items);
  res.json(listAccountTopics());
});

export default router;
