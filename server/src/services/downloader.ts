import fs from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import axios from 'axios';
import { getProxyAgent } from '../utils/httpAgent';
import type { PostMedia, MediaItem } from './mediaSource';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

export interface DownloadedFile {
  type: 'video' | 'image';
  file: string; // ten file, vd "video.mp4"
  path: string; // duong dan day du
  ok: boolean;
  error?: string;
}

export interface DownloadResult {
  postId: string;
  dir: string;
  captionPath: string;
  files: DownloadedFile[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// Cho video savethreads xu ly toi da bao lau (do thuc te ~5s/video, luc dong hang doi lau hon).
const VIDEO_WAIT_MS = 120_000;
const POLL_MS = 2000;

/**
 * Tai 1 URL ve destPath dang stream.
 * Voi video, savethreads tra JSON job-status { status, fileUrl } thay vi bytes:
 *   queued     -> fileUrl = "Waiting..."            (KHONG phai link)
 *   processing -> fileUrl = "In Processing..."      (KHONG phai link)
 *   completed  -> fileUrl = "https://..."           -> tai tiep tu fileUrl
 * Truoc day thay fileUrl khac rong la coi nhu link -> axios nem "Invalid URL" ngay luot dau,
 * nen moi video con trong hang doi deu bi danh dau tai loi.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const agent = getProxyAgent();
  let current = url;
  const deadline = Date.now() + VIDEO_WAIT_MS;
  let lastStatus = '';

  while (Date.now() < deadline) {
    const res = await axios.get(current, {
      responseType: 'stream',
      timeout: 60_000,
      maxRedirects: 5,
      headers: { 'user-agent': USER_AGENT, referer: 'https://savethreads.io/' },
      ...(agent ? { httpAgent: agent, httpsAgent: agent, proxy: false as const } : {}),
    });

    const contentType = String(res.headers['content-type'] ?? '');
    const isJson = /application\/json|text\//i.test(contentType);

    if (!isJson) {
      // La file that -> ghi ra dia
      await pipeline(res.data, fs.createWriteStream(destPath));
      return;
    }

    // La JSON job-status
    const body = await streamToString(res.data);
    let job: { status?: string; fileUrl?: string };
    try {
      job = JSON.parse(body);
    } catch {
      throw new Error(`Phan hoi khong phai file/JSON hop le: ${body.slice(0, 120)}`);
    }

    if (job.fileUrl && /^https?:\/\//i.test(job.fileUrl)) {
      current = job.fileUrl; // vong sau se tai file that
      continue;
    }
    lastStatus = job.status ?? '';
    if (/^(error|failed|fail)$/i.test(lastStatus)) {
      throw new Error(`savethreads xu ly video that bai (status="${lastStatus}")`);
    }
    // queued/processing -> cho roi hoi lai chinh URL nay
    await sleep(POLL_MS);
  }

  throw new Error(
    `Video chua xu ly xong sau ${VIDEO_WAIT_MS / 1000}s (status="${lastStatus || 'khong ro'}") - crawl lai media sau.`,
  );
}

// Moi loai media vao 1 thu muc con rieng trong bai.
const SUBDIR: Record<MediaItem['type'], string> = { video: 'videos', image: 'img' };

/** Dat ten file: 1 cai thi "video.mp4"; nhieu cai cung type thi "video_01.mp4". */
function fileNameFor(item: MediaItem, indexWithinType: number, totalOfType: number): string {
  const ext = item.ext ?? (item.type === 'video' ? 'mp4' : 'jpg');
  if (totalOfType === 1) return `${item.type}.${ext}`;
  const n = String(indexWithinType + 1).padStart(2, '0');
  return `${item.type}_${n}.${ext}`;
}

/**
 * Tao folder post_XXX, ghi caption.txt, tai tung media.
 * Loi 1 file khong lam chet ca bai: ghi nhan loi + xoa file do, cac file khac van tai.
 */
export async function downloadPost(
  post: PostMedia,
  baseDir: string,
  onFile?: (f: DownloadedFile, done: number, total: number) => void, // bao tien do tung file
): Promise<DownloadResult> {
  const dir = path.join(baseDir, `post_${post.postId}`);
  await mkdir(dir, { recursive: true });

  const captionPath = path.join(dir, 'caption.txt');
  await writeFile(captionPath, post.caption ?? '', 'utf8');

  // dem tong so tung type de quyet dinh co danh so hay khong
  const totals = { video: 0, image: 0 };
  const seen = { video: 0, image: 0 };
  for (const m of post.media) totals[m.type]++;

  const files: DownloadedFile[] = [];
  for (const item of post.media) {
    const name = fileNameFor(item, seen[item.type]++, totals[item.type]);
    const subdir = SUBDIR[item.type];
    const destDir = path.join(dir, subdir);
    await mkdir(destDir, { recursive: true }); // tao videos/ hoac img/ khi can
    const destPath = path.join(destDir, name);
    const relName = `${subdir}/${name}`;
    try {
      if (item.download) {
        // Nguon can POST kem session rieng (vd snapsave.vn) - da tai san bytes, chi ghi ra dia.
        const buf = await item.download();
        await writeFile(destPath, buf);
      } else {
        await downloadFile(item.url, destPath);
      }
      files.push({ type: item.type, file: relName, path: destPath, ok: true });
    } catch (err) {
      await rm(destPath, { force: true }); // xoa file tai do
      const msg = err instanceof Error ? err.message : String(err);
      files.push({ type: item.type, file: relName, path: destPath, ok: false, error: msg });
    }
    onFile?.(files[files.length - 1], files.length, post.media.length);
  }

  return { postId: post.postId, dir, captionPath, files };
}
