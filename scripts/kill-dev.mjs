// Giai phong cong dev + don sach cac tien trinh dev con treo lai.
//
// Vi sao can: "npm run dev" de ra mot cay tien trinh
//   npm -> cmd -> concurrently -> npm -> cmd -> node --watch -> node con (cai thuc su mo cong)
// Hai cai bay hay gap:
//   1. Dong terminal / tat lop ngoai KHONG giet lop trong -> node con van om cong 3000.
//   2. Khi node con crash vi EADDRINUSE, "node --watch" KHONG chet ma dung cho file thay doi.
//      Chay nham npm run dev vai lan se co vai con watcher nam cho; sua bat ky file nao la
//      chung cung bat day gianh cong -> lai EADDRINUSE. Loai nay khong om cong nen tim theo
//      cong se khong thay.
// Nen script don theo CA HAI huong: theo cong dang mo, va theo cay tien trinh cua project.
//
//   npm run kill
import { execFileSync } from 'node:child_process';

const PORTS = [3000, 5173];
const isWindows = process.platform === 'win32';

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return ''; // khong tim thay gi -> lenh tra ve ma loi, coi nhu rong
  }
};

/**
 * PID dang LANG NGHE cong (khong phai ket noi den cong do).
 * Tach cot thay vi do regex: dong netstat co dang
 *   TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    12740
 * Nhan dien qua "dia chi local ket thuc bang :<port>" + "dia chi foreign la :0" -> khong phu
 * thuoc chu LISTENING (Windows ngon ngu khac co the dich chu nay).
 */
function listenersOn(port) {
  if (!isWindows) {
    return [
      ...new Set(run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']).split('\n').filter(Boolean)),
    ];
  }
  const pids = new Set();
  for (const line of run('netstat', ['-ano']).split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const [, local, foreign] = parts;
    const pid = parts[parts.length - 1];
    if (!local?.endsWith(`:${port}`)) continue;
    if (!foreign?.endsWith(':0')) continue; // dac trung cua socket dang lang nghe
    if (pid && pid !== '0') pids.add(pid);
  }
  return [...pids];
}

/** Toan bo tien trinh dang chay kem cha + dong lenh, de lan ra ca cay. */
function snapshotProcesses() {
  if (!isWindows) return [];
  // -Command chu khong phai -File nen khong dinh ExecutionPolicy.
  const json = run('powershell', [
    '-NoProfile',
    '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
  ]);
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** Cac PID thuoc cay dev cua project (ke ca con dang nam cho, khong om cong nao). */
function projectDevPids(seedPids) {
  const procs = snapshotProcesses();
  if (procs.length === 0) return [...seedPids];

  // Khong tu ban vao chan: bo qua chinh script nay va toan bo to tien cua no.
  const parentOf = new Map(procs.map((p) => [p.ProcessId, p.ParentProcessId]));
  const selfLine = new Set();
  for (let id = process.pid; id && !selfLine.has(id); id = parentOf.get(id)) selfLine.add(id);

  // CHI nhan dien tien trinh dev thuc su. Tuyet doi khong loc theo ten thu muc project:
  // moi terminal dang dung cd trong project deu co ten do trong dong lenh -> se giet nham
  // ca terminal cua nguoi dung.
  const norm = (c) => c.split('\\').join('/').toLowerCase();
  const repoModules = `${norm(process.cwd())}/node_modules`;
  const isDevProcess = (cmd) => {
    const c = norm(cmd);
    // concurrently / vite chay tu node_modules CUA CHINH repo nay
    if (c.includes(repoModules) && /\/(concurrently|vite)\//.test(c)) return true;
    // server cua repo: bo ba co dinh trong package.json
    return c.includes('--watch') && c.includes('--experimental-sqlite') && /src\/index\.ts/.test(c);
  };

  const wanted = new Set();
  for (const pid of seedPids) wanted.add(Number(pid));
  for (const p of procs) if (isDevProcess(p.CommandLine ?? '')) wanted.add(p.ProcessId);

  // Lan xuong con, va lan len cha neu cha la lop bao npm/cmd cua chinh cay dev.
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of procs) {
      const cmd = p.CommandLine ?? '';
      if (wanted.has(p.ParentProcessId) && !wanted.has(p.ProcessId)) {
        wanted.add(p.ProcessId);
        grew = true;
      }
      if (wanted.has(p.ProcessId) && !wanted.has(p.ParentProcessId)) {
        const parent = procs.find((q) => q.ProcessId === p.ParentProcessId);
        const pcmd = parent?.CommandLine ?? '';
        if (/npm-cli\.js.{0,40}run dev|concurrently|node --watch/i.test(pcmd)) {
          wanted.add(parent.ProcessId);
          grew = true;
        }
      }
    }
  }

  for (const id of selfLine) wanted.delete(id);
  return [...wanted];
}

const seed = [];
for (const port of PORTS) {
  const pids = listenersOn(port);
  if (pids.length === 0) console.log(`cong ${port}: trong`);
  else for (const pid of pids) console.log(`cong ${port}: PID ${pid} dang giu`);
  seed.push(...pids);
}

const targets = projectDevPids(seed);
if (targets.length === 0) {
  console.log('\nKhong co tien trinh dev nao dang chay.');
} else {
  for (const pid of targets) {
    if (isWindows) run('taskkill', ['/F', '/T', '/PID', String(pid)]);
    else run('kill', ['-9', String(pid)]);
  }
  console.log(`\nDa tat ${targets.length} tien trinh dev. Chay lai "npm run dev" duoc roi.`);
}
