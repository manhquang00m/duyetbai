import { db } from './index';
import { renameInDistributionHistory } from './postingTopics';

export interface Account {
  id: number;
  name: string; // = "Profile" trong file import
  active: number;
  banned: number;
  device: string | null;
  pass_threads: string | null;
  gmail: string | null;
  gmail_password: string | null;
  proxy: string | null;
  platform: string | null; // 'Stable' | 'Global'
  proxy_type: string | null; // cot J file import, xem db/accountEnums.ts
  appeal_status: string | null; // cot K file import
  note: string | null; // cot L file import
  created_at: string;
  proxy_status?: string | null; // 'live' | 'die' | null - lay tu bang proxies (chi co trong listAccounts)
  proxy_checked_at?: string | null;
}

export interface AccountInput {
  name: string;
  active?: boolean;
  banned?: boolean;
  device?: string | null;
  pass_threads?: string | null;
  gmail?: string | null;
  gmail_password?: string | null;
  proxy?: string | null;
  platform?: string | null;
  proxy_type?: string | null;
  appeal_status?: string | null;
  note?: string | null;
  created_at?: string;
}

const ACCOUNT_COLUMNS =
  'id, name, active, banned, device, pass_threads, gmail, gmail_password, proxy, platform, proxy_type, appeal_status, note, created_at';

const insAccount = db.prepare(
  'INSERT OR IGNORE INTO accounts (name, active, created_at) VALUES (?, 1, ?)',
);

/** Them nhanh chi voi ten (dung cho script CLI / round-robin, giu tuong thich cu). */
export function addAccount(name: string): void {
  insAccount.run(name, new Date().toISOString());
}

/**
 * Danh sach ten account dang active VA proxy khong bi Die, theo thu tu them vao (dung cho round-robin).
 * Account co proxy da kiem tra = 'die' se bi loai (tranh gan bai cho account chac chan khong dang duoc);
 * account chua co proxy hoac proxy chua kiem tra van duoc tinh la kha dung.
 */
export function listActiveAccounts(): string[] {
  const rows = db
    .prepare(
      `SELECT a.name
         FROM accounts a
        WHERE a.active = 1
          AND NOT EXISTS (
            SELECT 1 FROM proxies p WHERE p.proxy = a.proxy AND p.status = 'die'
          )
        ORDER BY a.id`,
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

/** Tat ca account (ke ca inactive) cho UI quan ly, kem trang thai proxy (join bang proxies). */
export function listAccounts(): Account[] {
  return db
    .prepare(
      `SELECT a.id, a.name, a.active, a.banned, a.device, a.pass_threads, a.gmail,
              a.gmail_password, a.proxy, a.platform, a.proxy_type, a.appeal_status, a.note,
              a.created_at, p.status AS proxy_status, p.checked_at AS proxy_checked_at
         FROM accounts a
         LEFT JOIN proxies p ON p.proxy = a.proxy
        ORDER BY a.id`,
    )
    .all() as Account[];
}

export function getAccount(id: number): Account | null {
  return (
    (db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?`).get(id) as
      | Account
      | undefined) ?? null
  );
}

export function getAccountByName(name: string): Account | null {
  return (
    (db.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE name = ?`).get(name) as
      | Account
      | undefined) ?? null
  );
}

/** Tao 1 account day du (dung cho form "Them" tren UI). Loi neu name da ton tai. */
export function createAccount(input: AccountInput): Account {
  const proxy = input.proxy?.trim() || null;
  db.prepare(
    `INSERT INTO accounts (name, active, banned, device, pass_threads, gmail, gmail_password, proxy,
                           platform, proxy_type, appeal_status, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.name,
    input.active === false ? 0 : 1,
    input.banned ? 1 : 0,
    input.device ?? null,
    input.pass_threads ?? null,
    input.gmail ?? null,
    input.gmail_password ?? null,
    proxy,
    input.platform ?? null,
    input.proxy_type ?? null,
    input.appeal_status ?? null,
    input.note ?? null,
    input.created_at || new Date().toISOString(),
  );
  return getAccountByName(input.name)!;
}

/** Cap nhat tung phan (chi ghi de field co mat trong patch). */
export function updateAccount(id: number, patch: Partial<AccountInput>): Account | null {
  const fields: string[] = [];
  const args: unknown[] = [];

  // Lich su chong trung cua "Phan phoi bai" khoa theo TEN account (snapshot). Doi ten ma khong
  // keo theo la account do duoc phat lai toan bo bai cu -> pha luat "1 account khong nhan lai
  // 1 bai". Phai lam TRUOC khi UPDATE de con doc duoc ten cu.
  if (patch.name !== undefined) {
    const before = getAccount(id);
    if (before && before.name !== patch.name) {
      renameInDistributionHistory(before.name, patch.name);
    }
    fields.push('name = ?');
    args.push(patch.name);
  }
  if (patch.active !== undefined) {
    fields.push('active = ?');
    args.push(patch.active ? 1 : 0);
  }
  if (patch.banned !== undefined) {
    fields.push('banned = ?');
    args.push(patch.banned ? 1 : 0);
  }
  if (patch.device !== undefined) {
    fields.push('device = ?');
    args.push(patch.device);
  }
  if (patch.pass_threads !== undefined) {
    fields.push('pass_threads = ?');
    args.push(patch.pass_threads);
  }
  if (patch.gmail !== undefined) {
    fields.push('gmail = ?');
    args.push(patch.gmail);
  }
  if (patch.gmail_password !== undefined) {
    fields.push('gmail_password = ?');
    args.push(patch.gmail_password);
  }
  if (patch.platform !== undefined) {
    fields.push('platform = ?');
    args.push(patch.platform);
  }
  if (patch.proxy_type !== undefined) {
    fields.push('proxy_type = ?');
    args.push(patch.proxy_type);
  }
  if (patch.appeal_status !== undefined) {
    fields.push('appeal_status = ?');
    args.push(patch.appeal_status);
  }
  if (patch.note !== undefined) {
    fields.push('note = ?');
    args.push(patch.note);
  }
  if (patch.proxy !== undefined) {
    // 1 proxy duoc phep dung chung cho nhieu account -> khong con kiem tra trung.
    fields.push('proxy = ?');
    args.push(patch.proxy?.trim() || null);
  }
  if (patch.created_at !== undefined) {
    fields.push('created_at = ?');
    args.push(patch.created_at);
  }

  if (fields.length === 0) return getAccount(id);

  args.push(id);
  db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...args);
  return getAccount(id);
}

export function removeAccount(id: number): void {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

export interface UpsertAccountResult {
  action: 'inserted' | 'updated';
}

/**
 * Upsert theo "name" (= Profile) - dung cho import Excel.
 * Profile da co -> ghi de toan bo field cung cap; chua co -> them moi.
 */
export function upsertAccount(input: AccountInput): UpsertAccountResult {
  const existing = getAccountByName(input.name);
  const proxy = input.proxy?.trim() || null;

  if (existing) {
    updateAccount(existing.id, {
      banned: input.banned,
      device: input.device,
      pass_threads: input.pass_threads,
      gmail: input.gmail,
      gmail_password: input.gmail_password,
      proxy,
      platform: input.platform,
      proxy_type: input.proxy_type,
      appeal_status: input.appeal_status,
      note: input.note,
      created_at: input.created_at,
    });
    return { action: 'updated' };
  }
  createAccount({ ...input, proxy });
  return { action: 'inserted' };
}
