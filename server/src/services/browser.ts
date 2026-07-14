import { chromium, type Browser } from 'playwright';
import proxyChain from 'proxy-chain';
import { normalizeProxyUrl } from '../utils/httpAgent';

/**
 * Chromium xu ly proxy-auth kem (treo o buoc 407). proxy-chain tao 1 proxy local KHONG auth,
 * tu dinh kem credential khi forward len proxy that. Dung chung cho ca 2 browser (Threads/Shopee)
 * va script dang nhap Shopee (shopeeLogin.ts).
 */
export async function resolveLaunchProxy(
  raw: string,
): Promise<{ launchProxy?: { server: string }; anonymizedUrl?: string }> {
  const proxyUrl = normalizeProxyUrl(raw);
  if (!proxyUrl) return {};
  const hasAuth = /\/\/[^/@]+@/.test(proxyUrl);
  if (hasAuth) {
    const anonymizedUrl = await proxyChain.anonymizeProxy(proxyUrl);
    return { launchProxy: { server: anonymizedUrl }, anonymizedUrl };
  }
  return { launchProxy: { server: proxyUrl } };
}

/** Bien moi truong proxy chung cho ca app (dung 1 bien duy nhat de dong bo giua cac may). */
export function getProxyRaw(): string {
  return process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
}

// 1 browser dung chung cho ca process (launch 1 lan, tai su dung).
let browser: Browser | null = null;
let anonymizedProxyUrl: string | null = null;

export async function getBrowser(): Promise<Browser> {
  if (browser) return browser;

  const { launchProxy, anonymizedUrl } = await resolveLaunchProxy(getProxyRaw());
  anonymizedProxyUrl = anonymizedUrl ?? null;

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

// Browser RIENG cho tinh nang kiem tra link Shopee - doc lap voi browser scrape Threads o tren
// (2 tien trinh Chromium tach biet), nhung dung CHUNG 1 bien proxy (HTTPS_PROXY) de dong bo don
// gian giua cac may - ket noi truc tiep (khong proxy) tren mang cong ty bi chan boi lop kiem tra
// TLS ("self-signed certificate in certificate chain"), da xac nhan qua test truc tiep.
let shopeeBrowser: Browser | null = null;
let shopeeAnonymizedProxyUrl: string | null = null;

export async function getShopeeBrowser(): Promise<Browser> {
  if (shopeeBrowser) return shopeeBrowser;

  const { launchProxy, anonymizedUrl } = await resolveLaunchProxy(getProxyRaw());
  shopeeAnonymizedProxyUrl = anonymizedUrl ?? null;

  shopeeBrowser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
    args: ['--disable-blink-features=AutomationControlled'],
    ...(launchProxy ? { proxy: launchProxy } : {}),
  });
  return shopeeBrowser;
}

export async function closeShopeeBrowser(): Promise<void> {
  if (shopeeBrowser) {
    await shopeeBrowser.close();
    shopeeBrowser = null;
  }
  if (shopeeAnonymizedProxyUrl) {
    await proxyChain.closeAnonymizedProxy(shopeeAnonymizedProxyUrl, true).catch(() => {});
    shopeeAnonymizedProxyUrl = null;
  }
}
