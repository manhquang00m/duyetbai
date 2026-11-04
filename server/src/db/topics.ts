import { db } from './index';

// Danh muc chu de - dung chung cho posts.topic (chu de TUNG BAI) va posting_account_topics (chu
// de ACCOUNT DANG). Hai khai niem van tach roi, chi chung bo gia tri hop le.

export interface Topic {
  name: string;
  sort_order: number;
  post_count: number; // so bai dang gan chu de nay
  account_count: number; // so account dang dang gan chu de nay
}

export class TopicError extends Error {}

const MAX_NAME = 50;

/** Ten chu de theo thu tu hien thi. */
export function listTopicNames(): string[] {
  return (db.prepare('SELECT name FROM topics ORDER BY sort_order, name').all() as { name: string }[]).map(
    (r) => r.name,
  );
}

/** Kem so bai/account dang dung - cho trang quan ly (xoa/doi ten biet truoc anh huong). */
export function listTopics(): Topic[] {
  return db
    .prepare(
      `SELECT t.name, t.sort_order,
              (SELECT COUNT(*) FROM posts p WHERE p.topic = t.name) AS post_count,
              (SELECT COUNT(*) FROM posting_account_topics a WHERE a.topic = t.name) AS account_count
         FROM topics t
        ORDER BY t.sort_order, t.name`,
    )
    .all() as unknown as Topic[];
}

const existsStmt = db.prepare('SELECT 1 FROM topics WHERE name = ?');

export function isTopic(name: string): boolean {
  return !!existsStmt.get(name);
}

function cleanName(raw: unknown): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new TopicError('Tên chủ đề không được để trống');
  if (name.length > MAX_NAME) throw new TopicError(`Tên chủ đề tối đa ${MAX_NAME} ký tự`);
  // Dau phay dung de tach nhieu chu de (import Excel, GROUP_CONCAT o accountTopics.ts).
  if (/[,;]/.test(name)) throw new TopicError('Tên chủ đề không được chứa dấu phẩy / chấm phẩy');
  return name;
}

export function createTopic(raw: unknown): void {
  const name = cleanName(raw);
  if (isTopic(name)) throw new TopicError(`Chủ đề "${name}" đã tồn tại`);
  const { next } = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM topics').get() as {
    next: number;
  };
  db.prepare('INSERT INTO topics (name, sort_order, created_at) VALUES (?, ?, ?)').run(
    name,
    next,
    new Date().toISOString(),
  );
}

/**
 * Doi ten -> keo theo moi noi dang luu TEN chu de (khong co FK): bai, chu de account, lich su phan
 * phoi. Khong doi thi bai/account dang gan ten cu se "mat" chu de tren UI.
 */
export function renameTopic(oldName: string, raw: unknown): void {
  const name = cleanName(raw);
  if (!isTopic(oldName)) throw new TopicError(`Không tìm thấy chủ đề "${oldName}"`);
  if (name === oldName) return;
  if (isTopic(name)) throw new TopicError(`Chủ đề "${name}" đã tồn tại`);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE topics SET name = ? WHERE name = ?').run(name, oldName);
    db.prepare('UPDATE posts SET topic = ? WHERE topic = ?').run(name, oldName);
    db.prepare('UPDATE posting_account_topics SET topic = ? WHERE topic = ?').run(name, oldName);
    db.prepare('UPDATE distribution_items SET topic = ? WHERE topic = ?').run(name, oldName);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Xoa chu de + bo gan khoi bai va account dang dung. Lich su phan phoi (distribution_items) GIU
 * nguyen ten cu - la snapshot ke hoach da xuat.
 */
export function deleteTopic(name: string): void {
  if (!isTopic(name)) throw new TopicError(`Không tìm thấy chủ đề "${name}"`);
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE posts SET topic = NULL WHERE topic = ?').run(name);
    db.prepare('DELETE FROM posting_account_topics WHERE topic = ?').run(name);
    db.prepare('DELETE FROM topics WHERE name = ?').run(name);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Ghi lai thu tu theo dung mang ten gui len (ten khong co trong mang giu thu tu cu, xep sau). */
export function reorderTopics(names: string[]): void {
  const upd = db.prepare('UPDATE topics SET sort_order = ? WHERE name = ?');
  db.exec('BEGIN');
  try {
    names.forEach((n, i) => upd.run(i, n));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
