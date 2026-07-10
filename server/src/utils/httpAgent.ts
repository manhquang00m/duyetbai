import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * Chuan hoa gia tri proxy tu .env thanh URL day du.
 * Chap nhan:
 *   - URL day du:        http://user:pass@ip:port  hoac  http://ip:port
 *   - Format nha ban:    ip:port                   (2 phan)
 *   - Format nha ban:    ip:port:user:pass         (4 phan, co xac thuc)
 */
export function normalizeProxyUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  if (value.includes('://')) return value; // da la URL day du

  const parts = value.split(':');
  if (parts.length === 2) {
    const [host, port] = parts;
    return `http://${host}:${port}`;
  }
  if (parts.length === 4) {
    const [host, port, user, pass] = parts;
    // encode phong khi user/pass co ky tu dac biet (@ : / ...)
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  // Khong ro format -> de nguyen, https-proxy-agent se bao loi neu sai.
  return value;
}

/**
 * Mang cong ty (SSI) thuong bat moi ket noi internet di qua proxy.
 * Node KHONG tu dong dung proxy nhu trinh duyet, nen phai cau hinh thu cong.
 *
 * Cach dung: dat HTTPS_PROXY trong file .env (xem normalizeProxyUrl cho cac format).
 * Neu KHONG set (mang o nha) -> tra undefined -> ket noi truc tiep.
 *
 * Doc lazy (moi lan goi) de chac chan dotenv da nap xong bien moi truong.
 */
export function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const raw = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  const proxyUrl = normalizeProxyUrl(raw);
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;
}

/**
 * Playwright can proxy dang { server, username?, password? } (khac axios).
 * Parse tu cung 1 bien HTTPS_PROXY (ho tro ca format ip:port:user:pass).
 */
export function getPlaywrightProxy():
  | { server: string; username?: string; password?: string }
  | undefined {
  const raw = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
  const proxyUrl = normalizeProxyUrl(raw);
  if (!proxyUrl) return undefined;
  try {
    const u = new URL(proxyUrl);
    const proxy: { server: string; username?: string; password?: string } = {
      server: `${u.protocol}//${u.host}`, // host da gom ca port
    };
    if (u.username) proxy.username = decodeURIComponent(u.username);
    if (u.password) proxy.password = decodeURIComponent(u.password);
    return proxy;
  } catch {
    return undefined;
  }
}
