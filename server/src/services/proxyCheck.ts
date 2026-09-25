import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import pLimit from 'p-limit';
import { normalizeProxyUrl } from '../utils/httpAgent';

export interface ProxyCheckResult {
  proxy: string;
  status: 'live' | 'die';
  ip?: string;
  ms?: number;
  error?: string;
}

const TEST_URL = 'https://api.ipify.org?format=json';
const CHECK_TIMEOUT_MS = 10_000;

async function checkOne(proxy: string): Promise<ProxyCheckResult> {
  const url = normalizeProxyUrl(proxy.trim());
  if (!url) return { proxy, status: 'die', error: 'proxy rong/sai dinh dang' };

  const started = Date.now();
  // axios `timeout` chi tinh tu luc REQUEST da GUI xong - qua HttpsProxyAgent, giai doan CONNECT
  // toi proxy chet/khong phan hoi co the treo lau hon nhieu (thuc te do duoc ~21s tren Windows,
  // khong phai 10s nhu khai bao) vi khong bi tinh vao timeout do. Dung AbortController de ep cung
  // ca giai doan connect, dam bao khong bao gio treo qua CHECK_TIMEOUT_MS - tranh 1 lan kiem tra
  // hang loat bi keo dai qua muc, de bi trung luc server --watch restart (mat ket noi giua chung
  // -> 502 tren Vite proxy).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const agent = new HttpsProxyAgent(url);
    const res = await axios.get(TEST_URL, {
      timeout: CHECK_TIMEOUT_MS,
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
      signal: controller.signal,
    });
    const ip = (res.data as { ip?: string })?.ip;
    return { proxy, status: 'live', ip, ms: Date.now() - started };
  } catch (err) {
    const timedOut = axios.isCancel(err) || (err instanceof Error && err.name === 'CanceledError');
    const error = timedOut
      ? `timeout ${CHECK_TIMEOUT_MS / 1000}s`
      : err instanceof Error
        ? err.message
        : String(err);
    return { proxy, status: 'die', error };
  } finally {
    clearTimeout(timer);
  }
}

/** Check nhieu proxy song song (gioi han 8). */
export async function checkProxies(proxies: string[]): Promise<ProxyCheckResult[]> {
  const limit = pLimit(8);
  const uniq = [...new Set(proxies.map((p) => p.trim()).filter(Boolean))];
  return Promise.all(uniq.map((p) => limit(() => checkOne(p))));
}

export async function checkProxy(proxy: string): Promise<ProxyCheckResult> {
  return checkOne(proxy);
}
