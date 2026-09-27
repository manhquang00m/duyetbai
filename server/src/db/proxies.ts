import { db } from './index';

export interface Proxy {
  id: number;
  proxy: string;
  status: string | null;
  ip: string | null;
  checked_at: string | null;
  created_at: string;
  proxy_type: string | null; // cot J file import account
  note: string | null; // cot L file import account
  account_names: string | null; // ten (cac) account dang gan proxy nay, cach nhau ", "
  account_count: number; // 1 proxy co the dung chung cho nhieu account
}

export interface ProxyInput {
  proxy: string;
  status?: string;
  ip?: string;
  proxy_type?: string | null;
  note?: string | null;
}

// Account trang thai 'Die' khong con dung duoc -> khong tinh la "dang dung" proxy (proxy chi con
// account Die gan vao = proxy ranh, gan lai cho account khac duoc).
const USING_ACCOUNT = "a.proxy = p.proxy AND COALESCE(a.appeal_status, '') <> 'Die'";

/** Danh sach proxy da luu, kem ten account dang gan (join theo chuoi proxy trung khop). */
export function listProxies(): Proxy[] {
  return db
    .prepare(
      `SELECT p.id, p.proxy, p.status, p.ip, p.checked_at, p.created_at, p.proxy_type, p.note,
              (SELECT GROUP_CONCAT(a.name, ', ') FROM accounts a WHERE ${USING_ACCOUNT}) AS account_names,
              (SELECT COUNT(*) FROM accounts a WHERE ${USING_ACCOUNT}) AS account_count
         FROM proxies p
        ORDER BY p.id DESC`,
    )
    .all() as Proxy[];
}

// Luu ket qua KIEM TRA: ghi de status/ip/checked_at (die thi ip phai bi xoa, khong giu ip cu),
// nhung KHONG dung toi proxy_type/note vi day la du lieu tu file import, khong lien quan.
const upsert = db.prepare(`
  INSERT INTO proxies (proxy, status, ip, checked_at, created_at)
  VALUES (@proxy, @status, @ip, @checked_at, @created_at)
  ON CONFLICT(proxy) DO UPDATE SET
    status = excluded.status,
    ip = excluded.ip,
    checked_at = excluded.checked_at
`);

// Luu LOAI PROXY + GHI CHU (tu file import account): nguoc lai, khong dung toi status/ip.
// COALESCE de o trong trong file khong xoa mat gia tri da co tu lan import truoc.
const upsertMeta = db.prepare(`
  INSERT INTO proxies (proxy, proxy_type, note, created_at)
  VALUES (@proxy, @proxy_type, @note, @created_at)
  ON CONFLICT(proxy) DO UPDATE SET
    proxy_type = COALESCE(excluded.proxy_type, proxies.proxy_type),
    note = COALESCE(excluded.note, proxies.note)
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
    // Loai/ghi chu di qua duong rieng de khong lam roi y nghia cua cau upsert ket qua kiem tra.
    if (it.proxy_type || it.note) {
      saveProxyMeta([{ proxy: it.proxy, proxy_type: it.proxy_type, note: it.note }]);
    }
  }
}

export interface ProxyMetaInput {
  proxy: string;
  proxy_type?: string | null;
  note?: string | null;
}

/**
 * Dua loai proxy + ghi chu tu file import account sang kho proxy (tao dong moi neu proxy chua co).
 * 1 proxy co the dung cho nhieu account: neu cac dong khai bao khac nhau thi dong SAU ghi de dong
 * truoc, con o de trong thi giu nguyen gia tri dang co.
 */
export function saveProxyMeta(items: ProxyMetaInput[]): void {
  const now = new Date().toISOString();
  for (const it of items) {
    const proxy = it.proxy?.trim();
    if (!proxy) continue;
    if (!it.proxy_type && !it.note) continue; // khong co gi de luu -> khong tao dong rong
    upsertMeta.run({
      proxy,
      proxy_type: it.proxy_type ?? null,
      note: it.note ?? null,
      created_at: now,
    });
  }
}

/** 1 proxy chi duoc ton tai 1 dong -> doi sang chuoi da co la loi. */
export class ProxyDuplicateError extends Error {
  constructor(public proxy: string) {
    super(`Proxy "${proxy}" đã có trong kho`);
    this.name = 'ProxyDuplicateError';
  }
}

export interface ProxyPatch {
  proxy?: string;
  proxy_type?: string | null;
  note?: string | null;
}

/**
 * Sua 1 proxy da luu. Doi chuoi proxy thi phai doi luon accounts.proxy dang tro toi no:
 * lien ket account <-> proxy o day la so khop CHUOI, khong phai khoa ngoai, nen khong doi
 * theo se lam cac account do mat proxy ma khong bao gi.
 */
export function updateProxy(id: number, patch: ProxyPatch): Proxy | null {
  const current = getProxy(id);
  if (!current) return null;

  const nextProxy = patch.proxy?.trim();
  const renaming = !!nextProxy && nextProxy !== current.proxy;
  if (renaming) {
    const clash = db.prepare('SELECT id FROM proxies WHERE proxy = ? AND id <> ?').get(nextProxy, id);
    if (clash) throw new ProxyDuplicateError(nextProxy);
  }

  const fields: string[] = [];
  const args: (string | null)[] = [];
  if (renaming) {
    fields.push('proxy = ?');
    args.push(nextProxy);
  }
  if (patch.proxy_type !== undefined) {
    fields.push('proxy_type = ?');
    args.push(patch.proxy_type);
  }
  if (patch.note !== undefined) {
    fields.push('note = ?');
    args.push(patch.note);
  }
  if (fields.length === 0) return current;

  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE proxies SET ${fields.join(', ')} WHERE id = ?`).run(...args, id);
    if (renaming) {
      db.prepare('UPDATE accounts SET proxy = ? WHERE proxy = ?').run(nextProxy, current.proxy);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return getProxy(id) ?? null;
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
