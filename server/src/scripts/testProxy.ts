import 'dotenv/config';
import { getBrowser, closeBrowser } from '../services/browser';
import { getPlaywrightProxy } from '../utils/httpAgent';

// Kiem tra Playwright co ra internet qua proxy khong.
//   npm run test:proxy -w server                         -> site trung tinh (ipify)
//   npm run test:proxy -w server -- https://www.threads.com/@baoyennn_1406/post/DMASTC8SVKz
const target = process.argv[2] || 'https://api.ipify.org?format=json';

(async () => {
  const proxy = getPlaywrightProxy();
  console.log('Proxy Playwright:', proxy ? `server=${proxy.server} auth=${proxy.username ? 'co' : 'khong'}` : 'KHONG CAU HINH');
  console.log('Mo:', target);

  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log('HTTP status:', resp?.status());
    const body = (await page.content()).replace(/\s+/g, ' ').slice(0, 300);
    console.log('Noi dung (300 ky tu dau):', body);
  } catch (err) {
    console.error('LOI:', err instanceof Error ? err.message : String(err));
  } finally {
    await context.close();
    await closeBrowser();
  }
})();
