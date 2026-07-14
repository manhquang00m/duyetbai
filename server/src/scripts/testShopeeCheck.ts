import 'dotenv/config';
import { checkShopeeLink } from '../services/shopeeLinkCheck';
import { closeShopeeBrowser } from '../services/browser';

// Kiem tra 1 link Shopee con hang/het hang/khong ton tai (dung de debug/tinh chinh pattern).
//   npm run test:shopee -w server -- https://s.shopee.vn/xxxx
const link = process.argv[2];
if (!link) {
  console.error('Thieu link. Vi du: npm run test:shopee -w server -- https://s.shopee.vn/xxxx');
  process.exit(1);
}

(async () => {
  try {
    const result = await checkShopeeLink(link, (msg) => console.log('[log]', msg));
    console.log('RESULT:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('LOI:', err instanceof Error ? err.message : String(err));
  } finally {
    await closeShopeeBrowser();
  }
})();
