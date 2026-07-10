import 'dotenv/config'; // nap file .env (HTTPS_PROXY...) TRUOC cac import khac
import { getPostMedia } from '../services/mediaSource';

// Cach dung: npm run test:media -w server -- "<URL bai Threads>"
const url = process.argv[2];

if (!url) {
  console.error('Thieu URL. Cach dung:');
  console.error('  npm run test:media -w server -- "https://www.threads.com/@user/post/XXXX"');
  process.exit(1);
}

getPostMedia(url)
  .then((res) => {
    console.log('postId :', res.postId);
    console.log('title  :', res.title);
    console.log('caption:', res.caption);
    console.log(`media  : ${res.media.length} item`);
    res.media.forEach((m, i) => {
      console.log(`  #${i + 1} [${m.type}/${m.ext ?? '?'}] ${m.url.slice(0, 90)}...`);
    });
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Loi:', msg);
    process.exit(1);
  });
