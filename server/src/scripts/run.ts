import 'dotenv/config';
import fs from 'node:fs';
import { runBatch } from '../services/batch';
import { closeBrowser } from '../services/browser';
import { closeDb } from '../db';
import { URLS_FILE } from '../config';

// Cach dung:
//   npm run batch -w server                 (doc urls.txt o root)
//   npm run batch -w server -- path/to/list.txt
const file = process.argv[2] || URLS_FILE;

function readUrls(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    console.error(`Khong tim thay file URL: ${filePath}`);
    console.error('Tao file urls.txt o root, moi dong 1 URL bai Threads.');
    process.exit(1);
  }
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')); // bo dong trong va comment
}

(async () => {
  const urls = readUrls(file);
  console.log(`Nap ${urls.length} URL tu ${file}\n`);

  const results = await runBatch(urls);

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  console.log(`\nXong. Thanh cong: ${ok}, that bai: ${fail}`);
  if (fail > 0) {
    console.log('Cac URL loi:');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.url}: ${r.error}`));
  }
})()
  .catch((err: unknown) => {
    console.error('Loi batch:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => {
    closeBrowser();
    closeDb();
  });
