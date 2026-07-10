import { db } from './index';

const insAccount = db.prepare(
  'INSERT OR IGNORE INTO accounts (name, active, created_at) VALUES (?, 1, ?)',
);

export function addAccount(name: string): void {
  insAccount.run(name, new Date().toISOString());
}

/** Danh sach ten account dang active, theo thu tu them vao (dung cho round-robin). */
export function listActiveAccounts(): string[] {
  const rows = db
    .prepare('SELECT name FROM accounts WHERE active = 1 ORDER BY id')
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export interface Account {
  id: number;
  name: string;
  active: number;
  created_at: string;
}

/** Tat ca account (ke ca inactive) cho UI quan ly. */
export function listAccounts(): Account[] {
  return db.prepare('SELECT id, name, active, created_at FROM accounts ORDER BY id').all() as Account[];
}

export function setAccountActive(id: number, active: boolean): void {
  db.prepare('UPDATE accounts SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
}

export function removeAccount(id: number): void {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}
