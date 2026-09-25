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
  topics: string[]; // cac chu de KHAC NHAU dang xuat hien trong bai cua tac gia nay (tung bai chi 1)
  post_count: number;
}

interface RawRow {
  username: string;
  topics_raw: string | null;
  post_count: number;
}

// GROUP_CONCAT DISTINCT voi dau phan cach \u0001: ten chu de khong co dau phay nhung dung phong.
const TOPICS_SUBQUERY = `(SELECT GROUP_CONCAT(DISTINCT topic) FROM (
                            SELECT p2.topic AS topic FROM posts p2
                             WHERE p2.username = p.username AND p2.topic IS NOT NULL
                          )) AS topics_raw`;

const toRow = (r: RawRow): AccountTopicRow => ({
  username: r.username,
  topics: r.topics_raw ? r.topics_raw.split(',').filter(Boolean) : [],
  post_count: r.post_count,
});

/**
 * Toan bo tac gia (username) tung xuat hien trong posts, kem CAC chu de KHAC NHAU dang xuat hien
 * trong bai cua ho (co the nhieu, vi tung bai duoc gan rieng) + so bai - dung cho popup "Gan chu
 * de theo tac gia" tren trang Bai viet.
 */
export function listAccountTopics(): AccountTopicRow[] {
  const rows = db
    .prepare(
      `SELECT p.username AS username, COUNT(*) AS post_count, ${TOPICS_SUBQUERY}
         FROM posts p
        WHERE p.username IS NOT NULL AND p.username <> ''
        GROUP BY p.username
        ORDER BY post_count DESC, p.username`,
    )
    .all() as unknown as RawRow[];
  return rows.map(toRow);
}

const updateByUsername = db.prepare('UPDATE posts SET topic = ? WHERE username = ?');

/**
 * Ap 1 chu de cho TOAN BO bai HIEN CO cua 1 tac gia (ghi de, ke ca bai da co chu de khac truoc do).
 * Dung cho bai cu/thu cong - bai moi cao qua "Thu thap theo nhom" da duoc gan THANG tung bai roi
 * (xem services/jobs.ts), khong can qua day nua.
 */
export function setAuthorTopic(username: string, topic: string | null): { updated: number } {
  const trimmed = username?.trim();
  if (!trimmed) return { updated: 0 };
  if (topic !== null && !ACCOUNT_TOPICS_SET.has(topic)) return { updated: 0 };
  const result = updateByUsername.run(topic, trimmed);
  return { updated: Number(result.changes) };
}

const updateOne = db.prepare('UPDATE posts SET topic = ? WHERE post_id = ?');

/** Gan chu de cho DUNG 1 bai (theo post_id) - dung khi cao qua "Thu thap theo nhom URL". */
export function setPostTopic(postId: string, topic: string): void {
  if (!ACCOUNT_TOPICS_SET.has(topic)) return;
  updateOne.run(topic, postId);
}
