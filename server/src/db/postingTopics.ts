import { db } from './index';
import { ACCOUNT_TOPICS } from './accountTopics';

// Chu de cua ACCOUNT DANG BAI. Dung chung bo 7 gia tri voi posts.topic nhung la
// KHAI NIEM KHAC: posts.topic gan theo TUNG BAI (tu tac gia bai cao ve), bang nay gan theo
// TAI KHOAN DUNG DE DANG. Hai tap ten roi nhau hoan toan.

const TOPIC_SET = new Set<string>(ACCOUNT_TOPICS);

export interface PostingAccount {
  id: number;
  name: string;
  platform: string | null;
  active: number;
  banned: number;
  appeal_status: string | null;
  proxy: string | null;
  proxy_status: string | null;
  topics: string[];
}

interface RawRow {
  id: number;
  name: string;
  platform: string | null;
  active: number;
  banned: number;
  appeal_status: string | null;
  proxy: string | null;
  proxy_status: string | null;
  topics_raw: string | null;
}

const toAccount = (r: RawRow): PostingAccount => ({
  id: r.id,
  name: r.name,
  platform: r.platform,
  active: r.active,
  banned: r.banned,
  appeal_status: r.appeal_status,
  proxy: r.proxy,
  proxy_status: r.proxy_status,
  topics: r.topics_raw ? r.topics_raw.split('\u0001').filter(Boolean) : [],
});

// GROUP_CONCAT voi dau phan cach \u0001: ten chu de co dau phay ("Proxy trung gian - proxy.vn"
// khong co nhung dung phong) nen khong tach bang dau phay duoc.
const TOPICS_SUBQUERY = `(SELECT GROUP_CONCAT(t.topic, char(1)) FROM posting_account_topics t
                            WHERE t.account_id = a.id) AS topics_raw`;

/** Moi account + chu de dang gan (ke ca account chua gan) - cho bang gan chu de tren UI. */
export function listPostingAccounts(): PostingAccount[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.platform, a.active, a.banned, a.appeal_status, a.proxy,
              p.status AS proxy_status, ${TOPICS_SUBQUERY}
         FROM accounts a
         LEFT JOIN proxies p ON p.proxy = a.proxy
        ORDER BY a.id`,
    )
    .all() as unknown as RawRow[];
  return rows.map(toAccount);
}

// Chi 4 trang thai nay duoc coi la "dung de dang" cho Phan phoi bai - cac trang thai con lai
// (Chua tao nick, Dang khang, Die, hoac chua dat) deu bi loai. Gia tri phai KHOP DUNG tung ky tu
// voi accountEnums.ts (APPEAL_STATUSES).
const DISTRIBUTION_ALLOWED_STATUSES = ['Live', 'Kháng thành công', 'Chưa kháng', 'Đang ngâm'];

/**
 * Account DU DIEU KIEN nhan bai: active, khong banned, trang thai thuoc
 * DISTRIBUTION_ALLOWED_STATUSES, VA co it nhat 1 chu de. Proxy Die KHONG loai account (dang bai
 * qua tool auto dang ben ngoai, khong phu thuoc proxy cua app nay).
 * Chat hon listActiveAccounts() (dung cho round-robin) o cho loai banned va doi phai co chu de -
 * CO Y khong sua ham kia vi exportPosts dang phu thuoc vao no.
 */
export function listDistributionCandidates(topics?: string[]): PostingAccount[] {
  const conds = [
    'a.active = 1',
    'a.banned = 0',
    `a.appeal_status IN (${DISTRIBUTION_ALLOWED_STATUSES.map(() => '?').join(',')})`,
    'EXISTS (SELECT 1 FROM posting_account_topics t WHERE t.account_id = a.id)',
  ];
  const args: string[] = [...DISTRIBUTION_ALLOWED_STATUSES];
  if (topics && topics.length > 0) {
    conds.push(
      `EXISTS (SELECT 1 FROM posting_account_topics t
                WHERE t.account_id = a.id AND t.topic IN (${topics.map(() => '?').join(',')}))`,
    );
    args.push(...topics);
  }
  const rows = db
    .prepare(
      `SELECT a.id, a.name, a.platform, a.active, a.banned, a.appeal_status, a.proxy,
              p.status AS proxy_status, ${TOPICS_SUBQUERY}
         FROM accounts a
         LEFT JOIN proxies p ON p.proxy = a.proxy
        WHERE ${conds.join(' AND ')}
        ORDER BY a.id`,
    )
    .all(...args) as unknown as RawRow[];
  return rows.map(toAccount);
}

const delTopics = db.prepare('DELETE FROM posting_account_topics WHERE account_id = ?');
const insTopic = db.prepare(
  'INSERT OR IGNORE INTO posting_account_topics (account_id, topic, created_at) VALUES (?, ?, ?)',
);
const delOneTopic = db.prepare(
  'DELETE FROM posting_account_topics WHERE account_id = ? AND topic = ?',
);

/**
 * Ghi de toan bo chu de cua 1 account. KHONG tu mo transaction - accountImporter goi ham nay
 * ben trong transaction cua no, mo BEGIN long nhau se throw va rollback ca lan import.
 */
export function setPostingTopicsUnsafe(accountId: number, topics: string[]): void {
  delTopics.run(accountId);
  const now = new Date().toISOString();
  for (const t of new Set(topics)) {
    if (!TOPIC_SET.has(t)) continue; // gia tri la -> bo qua, khong nhet rac vao DB
    insTopic.run(accountId, t, now);
  }
}

/** Ban co transaction, dung khi goi tu API. */
export function setPostingTopics(accountId: number, topics: string[]): void {
  db.exec('BEGIN');
  try {
    setPostingTopicsUnsafe(accountId, topics);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Gan hang loat: them / bo / ghi de chu de cho nhieu account cung luc. */
export function bulkSetPostingTopics(
  accountIds: number[],
  topics: string[],
  mode: 'add' | 'remove' | 'replace',
): { updated: number } {
  const valid = [...new Set(topics)].filter((t) => TOPIC_SET.has(t));
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const id of accountIds) {
      if (mode === 'replace') {
        setPostingTopicsUnsafe(id, valid);
      } else if (mode === 'add') {
        for (const t of valid) insTopic.run(id, t, now);
      } else {
        for (const t of valid) delOneTopic.run(id, t);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { updated: accountIds.length };
}

/**
 * Doi ten account -> keo theo lich su chong trung.
 * distribution_items khoa theo account_name (snapshot), khong doi theo la account do
 * duoc phat lai TOAN BO bai cu -> pha luat "1 account khong nhan lai 1 bai".
 */
export function renameInDistributionHistory(oldName: string, newName: string): void {
  db.prepare('UPDATE distribution_items SET account_name = ? WHERE account_name = ?').run(
    newName,
    oldName,
  );
}
