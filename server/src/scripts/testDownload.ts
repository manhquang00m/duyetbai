import 'dotenv/config';
import { getPostMedia } from '../services/mediaSource';
import { downloadPost } from '../services/downloader';
import { DOWNLOAD_DIR } from '../config';

// Cach dung: npm run test:download -w server -- "<URL bai Threads>"
const url = process.argv[2];

if (!url) {
  console.error('Thieu URL. Cach dung:');
  console.error('  npm run test:download -w server -- "https://www.threads.com/@user/post/XXXX"');
  process.exit(1);
}

(async () => {
  console.log('1) Lay metadata...');
  const post = await getPostMedia(url);
  console.log(`   OK - ${post.media.length} media, caption ${post.caption.length} ky tu`);

  console.log('2) Tai file...');
  const result = await downloadPost(post, DOWNLOAD_DIR);

  console.log('Thu muc:', result.dir);
  console.log('Caption:', result.captionPath);
  for (const f of result.files) {
    console.log(f.ok ? `   OK   ${f.file}` : `   FAIL ${f.file} -> ${f.error}`);
  }

  const failed = result.files.filter((f) => !f.ok).length;
  process.exit(failed > 0 ? 1 : 0);
})().catch((err: unknown) => {
  console.error('Loi:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
