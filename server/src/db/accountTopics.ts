import { db } from './index';

// Danh sach chu de co dinh - phai khop voi ACCOUNT_TOPICS o client/src/lib/api.ts.
export const ACCOUNT_TOPICS = [
  'Công nghệ',
  'Sản phẩm',
  'Makeup',
  'Chó mèo',
  'Hút view',
  'Khác',
  'Gây war',
] as const;

const ACCOUNT_TOPICS_SET = new Set<string>(ACCOUNT_TOPICS);

export interface AccountTopicRow {
  username: string;
  topic: string | null;
  post_count: number;
}

/**
 * Toan bo tac gia (username) tung xuat hien trong posts, kem chu de dang gan (neu co) + so bai -
 * dung cho popup "Gan chu de" tren trang Bai viet (gan theo tac gia, ap dung cho ca cac bai da co).
 */
export function listAccountTopics(): AccountTopicRow[] {
  return db
    .prepare(
      `SELECT p.username AS username, t.topic AS topic, COUNT(*) AS post_count
         FROM posts p
         LEFT JOIN account_topics t ON t.username = p.username
        WHERE p.username IS NOT NULL AND p.username <> ''
        GROUP BY p.username
        ORDER BY post_count DESC, p.username`,
    )
    .all() as AccountTopicRow[];
}

const upsert = db.prepare(`
  INSERT INTO account_topics (username, topic, updated_at)
  VALUES (@username, @topic, @updated_at)
  ON CONFLICT(username) DO UPDATE SET topic = excluded.topic, updated_at = excluded.updated_at
`);

const clear = db.prepare('DELETE FROM account_topics WHERE username = ?');

/** Luu (hoac xoa neu topic rong) chu de cho danh sach tac gia. Topic khong hop le -> bo qua dong do. */
export function setAccountTopics(items: { username: string; topic: string }[]): void {
  const now = new Date().toISOString();
  for (const it of items) {
    const username = it.username?.trim();
    const topic = it.topic?.trim();
    if (!username) continue;
    if (!topic) {
      clear.run(username);
      continue;
    }
    if (!ACCOUNT_TOPICS_SET.has(topic)) continue;
    upsert.run({ username, topic, updated_at: now });
  }
}
