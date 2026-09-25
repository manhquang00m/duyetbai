import { listAccounts, updateAccount } from '../db/accounts';
import { saveProxies } from '../db/proxies';
import { checkProxies } from './proxyCheck';
import { fetchGpmProfiles, type GpmEdition } from './gpmLogin';
import { GPM_GLOBAL_URL, GPM_STABLE_URL } from '../config';

const PLATFORM_CONFIG: Record<string, { baseUrl: string; edition: GpmEdition }> = {
  Global: { baseUrl: GPM_GLOBAL_URL, edition: 'global' },
  Stable: { baseUrl: GPM_STABLE_URL, edition: 'stable' },
};

export interface ProxySyncChange {
  account: string;
  oldProxy: string | null;
  newProxy: string;
  status?: 'live' | 'die'; // ket qua kiem tra proxy MOI ngay sau khi dong bo
  ip?: string;
}

export interface ProxySyncResult {
  changed: ProxySyncChange[];
  uncheckedCount: number; // so account trung profile nhung proxy khong doi (khong can lam gi)
  unmatchedAccounts: string[]; // co platform, khong tim thay profile GPM trung ten
  skippedNoPlatform: string[]; // account chua khai bao platform Stable/Global -> khong biet goi GPM nao
  errors: { platform: string; error: string }[];
}

/**
 * Dong bo proxy tu GPM Login sang accounts.proxy: khop theo TEN (accounts.name = ten profile GPM),
 * goi dung ban GPM (Global/Stable) theo accounts.platform. Proxy nao thuc su THAY DOI thi cap nhat
 * VA kiem tra Live/Die ngay (luu vao kho proxy) - giai quyet dung noi dau cua nguoi dung: khong con
 * phai tu vao GPM xem proxy nao vua doi/die roi go tay sang.
 */
export async function syncProxiesFromGpm(): Promise<ProxySyncResult> {
  const accounts = listAccounts();
  const byPlatform = new Map<string, typeof accounts>();
  const skippedNoPlatform: string[] = [];
  for (const a of accounts) {
    if (!a.platform) {
      skippedNoPlatform.push(a.name);
      continue;
    }
    if (!byPlatform.has(a.platform)) byPlatform.set(a.platform, []);
    byPlatform.get(a.platform)!.push(a);
  }

  const result: ProxySyncResult = {
    changed: [],
    uncheckedCount: 0,
    unmatchedAccounts: [],
    skippedNoPlatform,
    errors: [],
  };

  for (const [platform, list] of byPlatform) {
    const cfg = PLATFORM_CONFIG[platform];
    if (!cfg) {
      result.errors.push({ platform, error: `Không biết địa chỉ GPM cho platform "${platform}"` });
      continue;
    }
    const { baseUrl, edition } = cfg;
    let profiles;
    try {
      profiles = await fetchGpmProfiles(baseUrl, edition);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({
        platform,
        error: `Không kết nối được GPM Login (${baseUrl}) — mở app GPM Login ${platform} trước khi đồng bộ. Lỗi: ${msg}`,
      });
      continue;
    }
    const byName = new Map(profiles.map((p) => [p.name.trim(), p.raw_proxy]));
    for (const a of list) {
      const gpmProxy = byName.get(a.name.trim());
      if (gpmProxy === undefined) {
        result.unmatchedAccounts.push(a.name);
        continue;
      }
      const next = gpmProxy?.trim() || null;
      if (next && next !== a.proxy) {
        updateAccount(a.id, { proxy: next });
        result.changed.push({ account: a.name, oldProxy: a.proxy, newProxy: next });
      } else {
        result.uncheckedCount++;
      }
    }
  }

  if (result.changed.length > 0) {
    const uniqueProxies = [...new Set(result.changed.map((c) => c.newProxy))];
    const checked = await checkProxies(uniqueProxies);
    const statusOf = new Map(checked.map((r) => [r.proxy, r]));
    saveProxies(checked.map((r) => ({ proxy: r.proxy, status: r.status, ip: r.ip })));
    for (const c of result.changed) {
      const r = statusOf.get(c.newProxy);
      if (r) {
        c.status = r.status;
        c.ip = r.ip;
      }
    }
  }

  return result;
}
