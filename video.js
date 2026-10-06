'use strict';
// video.js — local video file -> 1 fps JPEG frames via an ffmpeg sub-process. Main process only.
//
// IPC (all replies are { ok: true, ... } or { ok: false, error }; handlers never throw):
//   video:check                       -> { ok, ffmpeg, ffprobe }   (resolved binary paths or null)
//   video:pick                        -> { ok, path }              (native file dialog, path is null if cancelled)
//   video:extract { jobId, filePath } -> { ok, jobId, dir, frames[], count, ... } once finished
//   video:cancel  jobId               -> { ok, cancelled }         (kills ffmpeg now; the extract call resolves with cancelled: true)
//   video:clearCache                  -> { ok }                    (cancels running jobs, then wipes <userData>/video-cache)
// Events to the calling window: 'video:progress' { jobId, frames, seconds, percent|null }

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 1;                // standardized sample rate
const MAX_WIDTH = 1280;       // never wider than this; never upscale
const FILTER = `fps=${FPS},scale='min(${MAX_WIDTH},iw)':-2`; // -2 keeps the height even, as JPEG/yuv420 requires
const STALL_MS = Number(process.env.CUE_VIDEO_STALL_MS) || 30000; // kill ffmpeg after this long with no output (env override is for tests)
const KILL_GRACE_MS = 2000;   // SIGTERM first, SIGKILL if it hasn't exited by then
const PROBE_TIMEOUT_MS = 10000;
const MAX_JOBS = 2;
const CACHE_NAME = 'video-cache';
const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.wmv', '.flv', '.mpg', '.mpeg', '.ts', '.m2ts', '.3gp', '.ogv']);

const jobs = new Map(); // jobId -> job

// ---------- binaries ----------
// A Finder-launched macOS app gets a minimal PATH, so Homebrew's locations are checked explicitly.
function findBinary(name) {
  const exe = process.platform === 'win32' ? name + '.exe' : name;
  const candidates = [];
  const override = process.env[name === 'ffmpeg' ? 'CUE_FFMPEG' : 'CUE_FFPROBE'];
  if (override) candidates.push(override);
  for (const dir of (process.env.PATH || '').split(path.delimiter)) if (dir) candidates.push(path.join(dir, exe));
  if (process.platform !== 'win32') for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']) candidates.push(path.join(dir, exe));
  for (const c of candidates) {
    try { fs.accessSync(c, fs.constants.X_OK); if (fs.statSync(c).isFile()) return c; } catch {}
  }
  return null;
}

// Optional: gives the progress events a percentage. Failure just means percent is null.
function probeDuration(file, job) {
  const bin = findBinary('ffprobe');
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve) => {
    job.probe = execFile(bin, ['-v', 'error', '-protocol_whitelist', 'file', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
      { timeout: PROBE_TIMEOUT_MS, windowsHide: true }, (err, out) => {
        job.probe = null;
        const s = err ? NaN : parseFloat(out);
        resolve(Number.isFinite(s) && s > 0 ? s : null);
      });
  });
}

// ---------- cache ----------
const cacheRoot = (app) => path.join(app.getPath('userData'), CACHE_NAME);
const isInside = (root, p) => { const rel = path.relative(root, p); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
// The only deletion path in this module: refuses anything that isn't the cache root or a child of it.
// fs.rmSync unlinks symlinks rather than following them, so a link planted in the cache can't redirect the delete.
function wipe(root, target) {
  if (path.basename(root) !== CACHE_NAME) throw new Error('Refusing to wipe: unexpected cache location');
  if (target !== root && !isInside(root, target)) throw new Error('Refusing to delete outside the video cache');
  fs.rmSync(target, { recursive: true, force: true });
}

// ---------- process control ----------
const alive = (p) => p && p.exitCode === null && p.signalCode === null;
function terminate(job) {
  for (const p of [job.probe, job.child]) if (alive(p)) p.kill('SIGTERM');
  if (alive(job.child) && !job.killTimer) job.killTimer = setTimeout(() => { if (alive(job.child)) job.child.kill('SIGKILL'); }, KILL_GRACE_MS);
}
function cancel(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;
  job.cancelled = true; terminate(job);
  return true;
}

// ---------- extraction ----------
async function extract(ctx, sender, opts) {
  const { jobId, filePath } = opts || {};
  if (typeof jobId !== 'string' || !JOB_ID.test(jobId)) throw new Error('Invalid job id');
  if (jobs.has(jobId)) throw new Error('That job is already running');
  if (jobs.size >= MAX_JOBS) throw new Error('Too many video jobs running — wait for one to finish or cancel it');
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Video path must be an absolute path');
  if (!VIDEO_EXT.has(path.extname(filePath).toLowerCase())) throw new Error('Unsupported video type (' + (path.extname(filePath) || 'no extension') + ')');
  let st; try { st = fs.statSync(filePath); } catch { throw new Error('Video file not found'); }
  if (!st.isFile()) throw new Error('That path is not a file');
  const ffmpeg = findBinary('ffmpeg');
  if (!ffmpeg) throw new Error('ffmpeg was not found. Install it (macOS: brew install ffmpeg) or set CUE_FFMPEG to its full path.');

  const root = cacheRoot(ctx.app), dir = path.join(root, jobId), t0 = Date.now();
  const job = { id: jobId, child: null, probe: null, cancelled: false, stalled: false, watchdog: null, killTimer: null };
  job.finished = new Promise((r) => { job.release = r; });
  jobs.set(jobId, job); // reserved before the first await so cancel and the job cap both see it
  const onGone = () => cancel(jobId); // the window that asked was closed
  sender.once('destroyed', onGone);
  const fail = (error, extra) => { try { wipe(root, dir); } catch {} return { ok: false, jobId, error, ...extra }; };
  const emit = (p) => { if (!sender.isDestroyed()) sender.send('video:progress', { jobId, ...p }); };

  try {
    wipe(root, dir); fs.mkdirSync(dir, { recursive: true });
    const total = await probeDuration(filePath, job);
    if (job.cancelled) return fail('Cancelled', { cancelled: true });

    const args = ['-hide_banner', '-nostdin', '-nostats', '-loglevel', 'error', '-y', '-progress', 'pipe:1',
      '-protocol_whitelist', 'file', '-i', filePath,
      '-map', '0:v:0', '-an', '-sn', '-dn', '-vf', FILTER, '-q:v', '3', '-start_number', '1', path.join(dir, 'frame_%06d.jpg')];
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    job.child = child;

    const arm = () => { clearTimeout(job.watchdog); job.watchdog = setTimeout(() => { job.stalled = true; terminate(job); }, STALL_MS); };
    arm();
    let errTail = '', buf = '', frames = 0, seconds = 0;
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { arm(); errTail = (errTail + d).slice(-4000); });
    child.stdout.on('data', (d) => {
      arm(); buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        const eq = line.indexOf('='); if (eq < 0) continue;
        const k = line.slice(0, eq), v = line.slice(eq + 1);
        if (k === 'frame') frames = parseInt(v, 10) || frames;
        else if (k === 'out_time_us' || k === 'out_time_ms') { const n = Number(v); if (Number.isFinite(n) && n >= 0) seconds = n / 1e6; } // both fields are microseconds
        else if (k === 'progress') emit({ frames, seconds, percent: total ? Math.min(99, Math.floor((seconds / total) * 100)) : null });
      }
    });

    const exit = await new Promise((resolve) => {
      child.on('error', (e) => resolve({ spawnError: e.code === 'ENOENT' ? 'ffmpeg was not found' : e.message }));
      child.on('close', (code, signal) => resolve({ code, signal }));
    });

    if (job.cancelled) return fail('Cancelled', { cancelled: true });
    if (job.stalled) return fail(`ffmpeg produced no output for ${Math.round(STALL_MS / 1000)}s and was stopped`, { stalled: true });
    if (exit.spawnError) return fail(exit.spawnError);
    if (exit.code !== 0) return fail(errTail.trim().split('\n').filter(Boolean).pop() || `ffmpeg exited with code ${exit.code}`);

    const files = fs.readdirSync(dir).filter((n) => /^frame_\d{6,}\.jpg$/.test(n)).sort().map((n) => path.join(dir, n));
    if (!files.length) return fail('No frames were extracted — the file has no readable video');
    emit({ frames: files.length, seconds: total || seconds, percent: 100 });
    return { ok: true, jobId, dir, frames: files, count: files.length, fps: FPS, maxWidth: MAX_WIDTH, durationSec: total, elapsedMs: Date.now() - t0 };
  } finally {
    clearTimeout(job.watchdog); clearTimeout(job.killTimer);
    sender.removeListener('destroyed', onGone);
    jobs.delete(jobId); job.release();
  }
}

async function clearCache(ctx) {
  const root = cacheRoot(ctx.app);
  await Promise.all([...jobs.values()].map((j) => { j.cancelled = true; terminate(j); return j.finished; }));
  wipe(root, root);
}

// ---------- wiring ----------
function register({ ipcMain, app, dialog, BrowserWindow }) {
  const ctx = { app };
  // Every handler returns a plain object; thrown errors become { ok: false, error } instead of rejecting across IPC.
  const handle = (channel, fn) => ipcMain.handle(channel, async (e, ...a) => {
    try { return await fn(e, ...a); } catch (err) { return { ok: false, error: (err && err.message) || String(err) }; }
  });
  handle('video:check', () => ({ ok: true, ffmpeg: findBinary('ffmpeg'), ffprobe: findBinary('ffprobe') }));
  handle('video:pick', async (e) => {
    const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openFile'], filters: [{ name: 'Video', extensions: [...VIDEO_EXT].map((x) => x.slice(1)) }] });
    return { ok: true, path: r.canceled ? null : r.filePaths[0] };
  });
  handle('video:extract', (e, opts) => extract(ctx, e.sender, opts));
  handle('video:cancel', (_e, jobId) => ({ ok: true, cancelled: cancel(jobId) }));
  handle('video:clearCache', async () => { await clearCache(ctx); return { ok: true }; });
}

// App is quitting: stop every ffmpeg immediately and synchronously. The cache is left alone (clear it on request).
function shutdown() {
  for (const job of jobs.values()) {
    job.cancelled = true;
    for (const p of [job.probe, job.child]) if (alive(p)) p.kill('SIGKILL');
  }
}

module.exports = { register, shutdown };
