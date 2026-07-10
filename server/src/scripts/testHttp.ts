import 'dotenv/config';
import axios from 'axios';
import { getProxyAgent } from '../utils/httpAgent';

// Goi threads.com bang axios (qua proxy) de xem IP co bi Meta chan khong.
//   npm run test:http -w server
const url = process.argv[2] || 'https://www.threads.com/@baoyennn_1406/post/DMASTC8SVKz';

(async () => {
  const agent = getProxyAgent();
  console.log('Proxy:', agent ? 'CO' : 'KHONG');
  console.log('Mo:', url);
  try {
    const res = await axios.get(url, {
      timeout: 30_000,
      maxRedirects: 5,
      validateStatus: () => true, // khong throw theo status
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      },
      ...(agent ? { httpAgent: agent, httpsAgent: agent, proxy: false as const } : {}),
    });
    console.log('HTTP status:', res.status);
    console.log('HTML length:', String(res.data).length);
    console.log('Snippet:', String(res.data).replace(/\s+/g, ' ').slice(0, 200));
  } catch (err) {
    console.error('LOI:', err instanceof Error ? err.message : String(err));
  }
})();
