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

async function checkOne(proxy: string): Promise<ProxyCheckResult> {
  const url = normalizeProxyUrl(proxy.trim());
  if (!url) return { proxy, status: 'die', error: 'proxy rong/sai dinh dang' };

  const started = Date.now();
  try {
    const agent = new HttpsProxyAgent(url);
    const res = await axios.get(TEST_URL, {
      timeout: 10_000,
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
    });
    const ip = (res.data as { ip?: string })?.ip;
    return { proxy, status: 'live', ip, ms: Date.now() - started };
  } catch (err) {
    return { proxy, status: 'die', error: err instanceof Error ? err.message : String(err) };
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
