import axios from 'axios';

// Client cho local API cua GPM Login (antidetect browser).
// GPM chay 1 web server local tren may nguoi dung (khong phai dich vu cua ta) o cong co dinh
// (9495 ban Global, 19995 ban Stable - xem config.ts), tra ve danh sach profile kem proxy dang
// gan (raw_proxy). Doc de dong bo raw_proxy vao accounts.proxy; ghi duy nhat raw_proxy khi gan
// proxy moi tu trang Tai khoan (updateGpmProfileProxy).
//
// QUAN TRONG: 2 ban dung 2 API HOAN TOAN KHAC NHAU (da xac nhan bang tay tren may that, tai lieu
// https://gpmlogin.com/vi/doc chi mo ta dung ban Global):
//   - Global (v1): GET /api/v1/profiles -> { success, data: { data: [...], current_page, last_page } }
//   - Stable (v3, ban cu hon): GET /api/v3/profiles -> { success, data: [...], pagination: { page, total_page } }
// KHONG duoc gop chung 1 ham roi doan shape - phai goi dung endpoint theo tung ban.

export interface GpmProfile {
  id: string;
  name: string;
  raw_proxy: string | null;
}

export type GpmEdition = 'global' | 'stable';

interface RawProfile {
  id: string;
  name: string;
  raw_proxy: string | null;
}

interface GlobalProfilesResponse {
  success: boolean;
  message?: string;
  data?: {
    current_page: number;
    last_page: number;
    data: RawProfile[];
  };
}

interface StableProfilesResponse {
  success: boolean;
  message?: string;
  data?: RawProfile[];
  pagination?: { page: number; total_page: number };
}

const PAGE_SIZE = 100;

async function fetchGlobalProfiles(baseUrl: string): Promise<GpmProfile[]> {
  const out: GpmProfile[] = [];
  let page = 1;
  for (;;) {
    const { data } = await axios.get<GlobalProfilesResponse>(`${baseUrl}/api/v1/profiles`, {
      params: { page, page_size: PAGE_SIZE },
      timeout: 8_000,
    });
    if (!data?.success || !data.data) {
      throw new Error(data?.message || 'GPM Login (Global) trả về lỗi không rõ');
    }
    for (const p of data.data.data) out.push({ id: p.id, name: p.name, raw_proxy: p.raw_proxy ?? null });
    if (data.data.data.length === 0 || page >= data.data.last_page) break;
    page++;
  }
  return out;
}

async function fetchStableProfiles(baseUrl: string): Promise<GpmProfile[]> {
  const out: GpmProfile[] = [];
  let page = 1;
  for (;;) {
    const { data } = await axios.get<StableProfilesResponse>(`${baseUrl}/api/v3/profiles`, {
      params: { page, page_size: PAGE_SIZE },
      timeout: 8_000,
    });
    if (!data?.success || !data.data) {
      throw new Error(data?.message || 'GPM Login (Stable) trả về lỗi không rõ');
    }
    for (const p of data.data) out.push({ id: p.id, name: p.name, raw_proxy: p.raw_proxy ?? null });
    const totalPage = data.pagination?.total_page ?? 1;
    if (data.data.length === 0 || page >= totalPage) break;
    page++;
  }
  return out;
}

interface UpdateResponse {
  success: boolean;
  message?: string;
}

/**
 * Doi proxy cua 1 profile GPM. Global: POST /api/v1/profiles/update/{id} (theo tai lieu, gui kem
 * name vi bang tai lieu danh dau bat buoc). Stable: POST /api/v3/profiles/update/{id} - CHUA doi
 * chieu tai lieu (tai lieu chi co ban Global), xac nhan tren may that truoc khi dung dai tra.
 * Khong dua raw_proxy vao thong bao loi (chua user/pass).
 */
export async function updateGpmProfileProxy(
  baseUrl: string,
  edition: GpmEdition,
  profile: { id: string; name: string },
  rawProxy: string,
): Promise<void> {
  const id = encodeURIComponent(profile.id);
  const url =
    edition === 'stable' ? `${baseUrl}/api/v3/profiles/update/${id}` : `${baseUrl}/api/v1/profiles/update/${id}`;
  const body = edition === 'stable' ? { raw_proxy: rawProxy } : { name: profile.name, raw_proxy: rawProxy };
  const { data } = await axios.post<UpdateResponse>(url, body, { timeout: 8_000 });
  if (!data?.success) throw new Error(data?.message || 'GPM Login không xác nhận cập nhật');
}

interface StartResponse {
  success: boolean;
  message?: string;
  data?: { remote_debugging_address?: string };
}

/**
 * Mo 1 profile GPM, tra dia chi remote debugging ("127.0.0.1:port") de connectOverCDP.
 * Global: GET /api/v1/profiles/start/{id}; Stable: GET /api/v3/profiles/start/{id} - CHUA doi chieu
 * tren may that ca 2 ban, xac nhan truoc khi dung dai tra (giong updateGpmProfileProxy).
 */
export async function startGpmProfile(baseUrl: string, edition: GpmEdition, profileId: string): Promise<string> {
  const id = encodeURIComponent(profileId);
  const url =
    edition === 'stable' ? `${baseUrl}/api/v3/profiles/start/${id}` : `${baseUrl}/api/v1/profiles/start/${id}`;
  // Mo browser lan dau co the cham (tai core, khoi dong extension) -> timeout rong hon cac API khac.
  const { data } = await axios.get<StartResponse>(url, { timeout: 60_000 });
  const address = data?.data?.remote_debugging_address;
  if (!data?.success || !address) throw new Error(data?.message || 'GPM Login không trả remote_debugging_address');
  return address;
}

/** Dong profile GPM da mo bang startGpmProfile. Loi thi bo qua (profile co the da tu dong). */
export async function stopGpmProfile(baseUrl: string, edition: GpmEdition, profileId: string): Promise<void> {
  const id = encodeURIComponent(profileId);
  const url =
    edition === 'stable' ? `${baseUrl}/api/v3/profiles/close/${id}` : `${baseUrl}/api/v1/profiles/close/${id}`;
  await axios.get(url, { timeout: 15_000 }).catch(() => {});
}

/**
 * Lay TOAN BO profile cua 1 ban GPM (phan trang tu dong, dung dung API theo edition). Nem loi neu
 * GPM khong chay o baseUrl do (ECONNREFUSED) hoac tra ve success=false - de goi phia tren gom
 * thanh 1 dong loi ro rang theo platform, khong lam hong ca luot dong bo cac platform khac.
 */
export async function fetchGpmProfiles(baseUrl: string, edition: GpmEdition): Promise<GpmProfile[]> {
  return edition === 'stable' ? fetchStableProfiles(baseUrl) : fetchGlobalProfiles(baseUrl);
}
