import 'dotenv/config';
import fs from 'node:fs';
import { addAccount, listActiveAccounts } from '../db/accounts';
import { closeDb } from '../db';
import { ACCOUNTS_FILE } from '../config';

// Them account (sau nay se co UI quan ly):
//   npm run account:add -w server -- acc1 acc2 acc3     (them truc tiep)
//   npm run account:add -w server                       (doc tu accounts.txt)
const args = process.argv.slice(2);
let names = args;

if (names.length === 0) {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    console.error(`Khong co ten account tren dong lenh va khong thay ${ACCOUNTS_FILE}`);
    console.error('Cach dung: npm run account:add -w server -- acc1 acc2  (hoac tao accounts.txt)');
    process.exit(1);
  }
  names = fs
    .readFileSync(ACCOUNTS_FILE, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

for (const name of names) addAccount(name);
console.log('Da them. Accounts active:', listActiveAccounts().join(', ') || '(rong)');
closeDb();
