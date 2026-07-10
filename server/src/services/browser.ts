import { chromium, type Browser } from 'playwright';
import proxyChain from 'proxy-chain';
import { normalizeProxyUrl } from '../utils/httpAgent';

// 1 browser dung chung cho ca process (launch 1 lan, tai su dung).
let browser: Browser | null = null;
let anonymizedProxyUrl: string | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser) return browser;

  const proxyUrl = normalizeProxyUrl(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '');
  let launchProxy: { server: string } | undefined;

  if (proxyUrl) {
    const hasAuth = /\/\/[^/@]+@/.test(proxyUrl); // co user:pass@ khong?
    if (hasAuth) {
      // Chromium xu ly proxy-auth kem (treo o buoc 407). proxy-chain tao 1 proxy
      // local KHONG auth, tu dinh kem credential khi forward len proxy that.
      anonymizedProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
      launchProxy = { server: anonymizedProxyUrl };
    } else {
      launchProxy = { server: proxyUrl };
    }
  }

  browser = await chromium.launch({
    // HEADLESS=false trong .env de chay hien browser (khi can nhin/login)
    headless: process.env.HEADLESS !== 'false',
    ...(launchProxy ? { proxy: launchProxy } : {}),
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
  if (anonymizedProxyUrl) {
    await proxyChain.closeAnonymizedProxy(anonymizedProxyUrl, true).catch(() => {});
    anonymizedProxyUrl = null;
  }
}
