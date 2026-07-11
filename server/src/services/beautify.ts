import { spawn } from 'node:child_process';
import { z } from 'zod';
import { FFMPEG_PATH } from '../config';

/**
 * ===== Cau hinh "lam dep video" =====
 * watermark.text va watermarkImagePath (file upload) loai tru nhau: neu co anh, uu tien anh.
 */
export const BeautifyConfigSchema = z.object({
  filter: z.enum(['none', 'vivid', 'warm', 'cool', 'bw', 'vintage']).default('none'),
  brightness: z.number().min(-0.5).max(0.5).default(0),
  contrast: z.number().min(0.5).max(2).default(1),
  saturation: z.number().min(0).max(3).default(1),
  crop: z.enum(['none', '1:1', '9:16', '4:5', '16:9']).default('none'),
  rotate: z.number().min(-180).max(180).default(0),
  speed: z.number().min(0.5).max(2).default(1),
  removeMetadata: z.boolean().default(false),
  watermark: z
    .object({
      text: z.string().max(80).optional(),
      position: z
        .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'])
        .default('bottom-right'),
      opacity: z.number().min(0.1).max(1).default(0.8),
      fontSize: z.number().min(10).max(120).default(28),
      color: z.string().max(20).default('white'),
    })
    .optional(),
});

export type BeautifyConfig = z.infer<typeof BeautifyConfigSchema>;

function escapeDrawtext(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function drawtextPosition(position: string): { x: string; y: string } {
  const pad = 20;
  switch (position) {
    case 'top-left':
      return { x: `${pad}`, y: `${pad}` };
    case 'top-right':
      return { x: `w-tw-${pad}`, y: `${pad}` };
    case 'bottom-left':
      return { x: `${pad}`, y: `h-th-${pad}` };
    case 'center':
      return { x: '(w-tw)/2', y: '(h-th)/2' };
    case 'bottom-right':
    default:
      return { x: `w-tw-${pad}`, y: `h-th-${pad}` };
  }
}

function overlayPosition(position: string): { x: string; y: string } {
  const pad = 20;
  switch (position) {
    case 'top-left':
      return { x: `${pad}`, y: `${pad}` };
    case 'top-right':
      return { x: `main_w-overlay_w-${pad}`, y: `${pad}` };
    case 'bottom-left':
      return { x: `${pad}`, y: `main_h-overlay_h-${pad}` };
    case 'center':
      return { x: '(main_w-overlay_w)/2', y: '(main_h-overlay_h)/2' };
    case 'bottom-right':
    default:
      return { x: `main_w-overlay_w-${pad}`, y: `main_h-overlay_h-${pad}` };
  }
}

/** Xay chuoi video filter (crop/xoay/mau/watermark-text). Khong gom watermark khi co watermark anh. */
function buildVideoFilters(config: BeautifyConfig, hasWatermarkImage: boolean): string[] {
  const filters: string[] = [];

  if (config.crop !== 'none') {
    const [aw, ah] = config.crop.split(':').map(Number);
    const ratio = aw / ah;
    filters.push(`crop=min(iw\\,ih*${ratio}):min(ih\\,iw/${ratio})`);
  }

  if (config.rotate !== 0) {
    const n = ((config.rotate % 360) + 360) % 360;
    if (n === 90) filters.push('transpose=1');
    else if (n === 180) filters.push('transpose=1,transpose=1');
    else if (n === 270) filters.push('transpose=2');
    else {
      const rad = `${config.rotate}*PI/180`;
      filters.push(`rotate=${rad}:ow=rotw(${rad}):oh=roth(${rad}):c=black@0`);
    }
  }

  const eqParts: string[] = [];
  if (config.brightness !== 0) eqParts.push(`brightness=${config.brightness}`);
  if (config.contrast !== 1) eqParts.push(`contrast=${config.contrast}`);
  if (config.saturation !== 1) eqParts.push(`saturation=${config.saturation}`);

  switch (config.filter) {
    case 'vivid':
      eqParts.push('contrast=1.15', 'saturation=1.4');
      break;
    case 'warm':
      filters.push('colorbalance=rs=0.15:gs=0.05:bs=-0.12:rm=0.1:bm=-0.08');
      break;
    case 'cool':
      filters.push('colorbalance=rs=-0.12:bs=0.15:rm=-0.08:bm=0.1');
      break;
    case 'bw':
      eqParts.push('saturation=0');
      break;
    case 'vintage':
      filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
      eqParts.push('contrast=0.9', 'brightness=0.02');
      break;
    default:
      break;
  }
  if (eqParts.length) filters.push(`eq=${eqParts.join(':')}`);

  if (config.watermark?.text && !hasWatermarkImage) {
    const { x, y } = drawtextPosition(config.watermark.position);
    const text = escapeDrawtext(config.watermark.text);
    filters.push(
      `drawtext=text='${text}':fontsize=${config.watermark.fontSize}:fontcolor=${config.watermark.color}@${config.watermark.opacity}:x=${x}:y=${y}:box=1:boxcolor=black@0.25:boxborderw=8`,
    );
  }

  if (config.speed !== 1) {
    filters.push(`setpts=${(1 / config.speed).toFixed(4)}*PTS`);
  }

  return filters;
}

/** Xay day du args ffmpeg cho 1 file video. */
export function buildFfmpegArgs(
  input: string,
  output: string,
  config: BeautifyConfig,
  watermarkImagePath?: string,
): string[] {
  const args: string[] = ['-y', '-i', input];
  if (watermarkImagePath) args.push('-i', watermarkImagePath);

  const vfChain = buildVideoFilters(config, Boolean(watermarkImagePath)).join(',');

  if (watermarkImagePath) {
    const opacity = config.watermark?.opacity ?? 0.8;
    const { x, y } = overlayPosition(config.watermark?.position ?? 'bottom-right');
    const base = vfChain ? `[0:v]${vfChain}[base]` : '[0:v]null[base]';
    const complex = `${base};[1:v]format=rgba,colorchannelmixer=aa=${opacity}[wm];[base][wm]overlay=${x}:${y}[outv]`;
    args.push('-filter_complex', complex, '-map', '[outv]', '-map', '0:a?');
  } else if (vfChain) {
    args.push('-vf', vfChain, '-map', '0:v', '-map', '0:a?');
  } else {
    args.push('-map', '0:v', '-map', '0:a?');
  }

  if (config.speed !== 1) {
    args.push('-af', `atempo=${config.speed}`);
  }

  if (config.removeMetadata) {
    // Xoa metadata container (creation_time, GPS, thiet bi quay...) + tag rieng cua stream video
    args.push('-map_metadata', '-1', '-map_metadata:s:v:0', '-1');
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    output,
  );

  return args;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        reject(
          new Error(
            `Không tìm thấy ffmpeg ("${FFMPEG_PATH}"). Cài ffmpeg và thêm vào PATH, hoặc set FFMPEG_PATH trong server/.env.`,
          ),
        );
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg lỗi (mã ${code}): ${stderr.slice(-800)}`));
    });
  });
}

/** Chay ffmpeg de "lam dep" 1 file video -> ghi ra file output moi (khong ghi de file goc). */
export async function beautifyVideo(
  input: string,
  output: string,
  config: BeautifyConfig,
  watermarkImagePath?: string,
): Promise<void> {
  const args = buildFfmpegArgs(input, output, config, watermarkImagePath);
  await runFfmpeg(args);
}
