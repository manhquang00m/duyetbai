import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectPostInfo, infoRowToLine, INFO_HEADER } from '../services/pipeline';
import { closeBrowser } from '../services/browser';
import { extractShortcode } from '../utils/postId';
import { DOWNLOAD_DIR } from '../config';

// Cach dung: npm run test:comments -w server -- "<URL bai Threads>"
const url = process.argv[2];

if (!url) {
  console.error('Thieu URL. Cach dung:');
  console.error('  npm run test:comments -w server -- "https://www.threads.com/@user/post/XXXX"');
  process.exit(1);
}

(async () => {
  console.log('Dang lay info (savethreads + scrape comment)...');
  const rows = await collectPostInfo(url);

  console.log(`So dong info: ${rows.length}`);
  rows.forEach((r) => console.log('  ', infoRowToLine(r)));

  const dir = path.join(DOWNLOAD_DIR, `post_${extractShortcode(url)}`);
  await mkdir(dir, { recursive: true });

  const content = [INFO_HEADER, ...rows.map(infoRowToLine)].join('\n') + '\n';
  const filePath = path.join(dir, 'info.txt');
  await writeFile(filePath, content, 'utf8');

  console.log('Da ghi:', filePath);
})()
  .catch((err: unknown) => {
    console.error('Loi:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeBrowser();
  });
