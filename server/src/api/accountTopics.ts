import { Router } from 'express';
import { listAccountTopics, setAuthorTopic, setPostTopic } from '../db/accountTopics';

const router = Router();

// GET /api/account-topics -> tung tac gia (username) tung xuat hien + cac chu de dang xuat hien
// trong bai cua ho + so bai
router.get('/', (_req, res) => {
  res.json(listAccountTopics());
});

// POST /api/account-topics/author { username, topic } -> ap 1 chu de cho TOAN BO bai hien co cua
// tac gia do (topic = null/'' de xoa chu de khoi toan bo bai cua ho)
router.post('/author', (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const topicRaw = req.body?.topic;
  const topic = typeof topicRaw === 'string' && topicRaw.trim() ? topicRaw.trim() : null;
  if (!username) {
    res.status(400).json({ error: 'username không hợp lệ' });
    return;
  }
  setAuthorTopic(username, topic);
  res.json(listAccountTopics());
});

// POST /api/account-topics/post { postId, topic } -> gan/bo chu de cho DUNG 1 bai
// (topic = null/'' de bo gan)
router.post('/post', (req, res) => {
  const postId = String(req.body?.postId ?? '').trim();
  const topicRaw = req.body?.topic;
  const topic = typeof topicRaw === 'string' && topicRaw.trim() ? topicRaw.trim() : null;
  if (!postId) {
    res.status(400).json({ error: 'postId không hợp lệ' });
    return;
  }
  setPostTopic(postId, topic);
  res.json({ ok: true });
});

export default router;
