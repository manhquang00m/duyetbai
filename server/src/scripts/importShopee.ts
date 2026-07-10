import 'dotenv/config';
import { importShopeeLinks } from '../services/importer';
import { closeDb } from '../db';

// npm run import:shopee -w server -- <file.xlsx> [cotLinkGoc] [cotLinkMoi]
//   cot co the la ten header (vd "Lien ket goc") hoac chi so cot (1,2,3...)
const file = process.argv[2];
if (!file) {
  console.error('Thieu file. Cach dung:');
  console.error('  npm run import:shopee -w server -- shopee_output.xlsx');
  console.error('  npm run import:shopee -w server -- shopee_output.xlsx "Lien ket goc" "Lien ket moi"');
  process.exit(1);
}

const parseCol = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : v);

// Mac dinh: link goc cot A (1), link moi Shopee gen o cot G (7).
const origCol = parseCol(process.argv[3]) ?? 1;
const newCol = parseCol(process.argv[4]) ?? 7;

importShopeeLinks(file, { origCol, newCol })
  .then(({ updated, headers }) => {
    console.log('Cac cot trong file:', headers.join(' | '));
    console.log(`Da cap nhat new_link cho ${updated} dong.`);
    if (updated === 0) {
      console.log('Neu 0 -> chi dinh dung cot, vd: -- file.xlsx "Lien ket goc" "<ten cot link moi>"');
    }
  })
  .catch((err: unknown) => {
    console.error('Loi:', err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
