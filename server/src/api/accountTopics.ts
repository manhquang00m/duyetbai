import { Router } from 'express';
import { ACCOUNT_TOPICS, listAccountTopics, setAuthorTopic, setPostTopic, setPostsTopic } from '../db/accountTopics';

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

// POST /api/account-topics/posts { postIds, topic } -> gan/bo chu de cho NHIEU bai (toi da 500)
router.post('/posts', (req, res) => {
  const ids: unknown = req.body?.postIds;
  const topicRaw: unknown = req.body?.topic;
  const topic = typeof topicRaw === 'string' && topicRaw.trim() ? topicRaw.trim() : null;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 500 ||
    !ids.every((i) => typeof i === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(i))
  ) {
    res.status(400).json({ error: 'Danh sách bài không hợp lệ' });
    return;
  }
  if (topic !== null && !(ACCOUNT_TOPICS as readonly string[]).includes(topic)) {
    res.status(400).json({ error: 'Chủ đề không hợp lệ' });
    return;
  }
  res.json(setPostsTopic(ids as string[], topic));
});

export default router;
