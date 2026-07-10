import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { exportShopeeInput } from '../services/exporter';
import { closeDb } from '../db';
import { EXPORT_DIR } from '../config';

// npm run export:shopee -w server                (xuat ra exports/shopee_input.xlsx)
// npm run export:shopee -w server -- duong/dan.xlsx
const out = process.argv[2] || path.join(EXPORT_DIR, 'shopee_input.xlsx');
fs.mkdirSync(path.dirname(out), { recursive: true });

exportShopeeInput(out)
  .then((n) => console.log(`Da xuat ${n} link shopee (kem Sub_id=POST_ID) -> ${out}`))
  .catch((err: unknown) => {
    console.error('Loi:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
