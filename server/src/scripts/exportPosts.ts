import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { exportPosts } from '../services/exporter';
import { closeDb } from '../db';
import { EXPORT_DIR } from '../config';

// npm run export:posts -w server                (xuat ra exports/posts.xlsx)
// npm run export:posts -w server -- duong/dan.xlsx
const out = process.argv[2] || path.join(EXPORT_DIR, 'posts.xlsx');
fs.mkdirSync(path.dirname(out), { recursive: true });

exportPosts(out)
  .then((n) => console.log(`Da xuat ${n} bai -> ${out}`))
  .catch((err: unknown) => {
    console.error('Loi:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
