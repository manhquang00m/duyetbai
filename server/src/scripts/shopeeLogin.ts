import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { chromium } from 'playwright';
import proxyChain from 'proxy-chain';
import { resolveLaunchProxy, getProxyRaw } from '../services/browser';
import { SHOPEE_SESSION_PATH } from '../config';

// Dang nhap Shopee 1 lan bang trinh duyet that (hien cua so), luu lai session (cookie/localStorage)
// de tinh nang "kiem tra link Shopee" dung lai - giam bi chan boi he thong chong-bot vi khong con
// la phien an danh.
//   npm run shopee:login -w server
(async () => {
  const { launchProxy, anonymizedUrl } = await resolveLaunchProxy(getProxyRaw());
  const browser = await chromium.launch({
    headless: false, // luon hien cua so de nguoi dung dang nhap thu cong, bo qua HEADLESS env
    args: ['--disable-blink-features=AutomationControlled'],
    ...(launchProxy ? { proxy: launchProxy } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto('https://shopee.vn/buyer/login', { waitUntil: 'domcontentloaded' });

  console.log('\nMot cua so trinh duyet vua mo.');
  console.log('Hay dang nhap vao tai khoan Shopee cua ban trong cua so do.');
  console.log('Sau khi dang nhap xong (thay trang chu/tai khoan), quay lai day va nhan Enter...\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('Nhan Enter de luu phien dang nhap: ');
  rl.close();

  fs.mkdirSync(path.dirname(SHOPEE_SESSION_PATH), { recursive: true });
  await context.storageState({ path: SHOPEE_SESSION_PATH });
  console.log(`Da luu phien dang nhap vao ${SHOPEE_SESSION_PATH}`);

  await browser.close();
  if (anonymizedUrl) await proxyChain.closeAnonymizedProxy(anonymizedUrl, true).catch(() => {});
  process.exit(0);
})().catch((err) => {
  console.error('LOI:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
