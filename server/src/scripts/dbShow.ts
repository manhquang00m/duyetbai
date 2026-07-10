import 'dotenv/config';
import { db, closeDb } from '../db';

// In nhanh noi dung DB de kiem tra. Cach dung: npm run db:show -w server
const posts = db
  .prepare('SELECT post_id, username, likes, comments, views, post_date, scrape_error FROM posts')
  .all();
const mediaCount = db.prepare('SELECT COUNT(*) AS n FROM media').get() as { n: number };
const entries = db
  .prepare('SELECT post_id, comment, link FROM shopee_entries ORDER BY post_id')
  .all();

console.log(`POSTS (${posts.length}):`);
console.table(posts);

console.log(`\nMEDIA files: ${mediaCount.n}`);

console.log(`\nSHOPEE ENTRIES (${entries.length}):`);
console.table(entries);

closeDb();
