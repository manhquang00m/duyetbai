import { db } from './index';

export interface Proxy {
  id: number;
  proxy: string;
  status: string | null;
  ip: string | null;
  checked_at: string | null;
  created_at: string;
  account_names: string | null; // ten (cac) account dang gan proxy nay, cach nhau ", "
}

export interface ProxyInput {
  proxy: string;
  status?: string;
  ip?: string;
}

/** Danh sach proxy da luu, kem ten account dang gan (join theo chuoi proxy trung khop). */
export function listProxies(): Proxy[] {
  return db
    .prepare(
      `SELECT p.id, p.proxy, p.status, p.ip, p.checked_at, p.created_at,
              (SELECT GROUP_CONCAT(a.name, ', ') FROM accounts a WHERE a.proxy = p.proxy) AS account_names
         FROM proxies p
        ORDER BY p.id DESC`,
    )
    .all() as Proxy[];
}

const upsert = db.prepare(`
  INSERT INTO proxies (proxy, status, ip, checked_at, created_at)
  VALUES (@proxy, @status, @ip, @checked_at, @created_at)
  ON CONFLICT(proxy) DO UPDATE SET
    status = excluded.status,
    ip = excluded.ip,
    checked_at = excluded.checked_at
`);

/** Luu (hoac cap nhat) danh sach proxy. */
export function saveProxies(items: ProxyInput[]): void {
  const now = new Date().toISOString();
  for (const it of items) {
    if (!it.proxy?.trim()) continue;
    upsert.run({
      proxy: it.proxy.trim(),
      status: it.status ?? null,
      ip: it.ip ?? null,
      checked_at: it.status ? now : null,
      created_at: now,
    });
  }
}

export function removeProxy(id: number): void {
  db.prepare('DELETE FROM proxies WHERE id = ?').run(id);
}

export function getProxy(id: number): Proxy | undefined {
  return db.prepare('SELECT * FROM proxies WHERE id = ?').get(id) as Proxy | undefined;
}

export function updateProxyStatus(id: number, status: string, ip: string | null): void {
  db.prepare('UPDATE proxies SET status = ?, ip = ?, checked_at = ? WHERE id = ?').run(
    status,
    ip,
    new Date().toISOString(),
    id,
  );
}
