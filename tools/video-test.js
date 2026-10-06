// Plain-Node test for video.js (no Electron needed): `npm run test:video`. Requires ffmpeg + ffprobe on PATH.
process.env.CUE_VIDEO_STALL_MS = '2500'; // must be set before video.js is loaded
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-video-test-'));
const userData = path.join(tmp, 'userData');
fs.mkdirSync(userData);

const handlers = {};
require('./../video').register({
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
  app: { getPath: () => userData },
  dialog: {}, BrowserWindow: {},
});
const progress = [];
const sender = { send: (_ch, p) => progress.push(p), isDestroyed: () => false, once() {}, removeListener() {} };
const call = (ch, ...a) => handlers[ch]({ sender }, ...a);
const probeSize = (f) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).toString().trim().split(',').map(Number);
const mk = (name, size, secs) => { const f = path.join(tmp, name); execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=25:duration=${secs}`, '-pix_fmt', 'yuv420p', f]); return f; };
const fake = (name, body) => { const f = path.join(tmp, name); fs.writeFileSync(f, '#!/bin/sh\n' + body + '\n', { mode: 0o755 }); return f; };

let n = 0;
const test = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); n++; } catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; } };

(async () => {
  const big = mk('big.mp4', '1920x1080', 5.2), small = mk('small.mp4', '640x360', 3.1);
  const cacheDir = path.join(userData, 'video-cache');

  await test('check finds ffmpeg', async () => { const r = await call('video:check'); assert(r.ok && r.ffmpeg, JSON.stringify(r)); });

  await test('1920x1080 -> 1 fps frames, 1280 wide, even height', async () => {
    progress.length = 0;
    const r = await call('video:extract', { jobId: 'big1', filePath: big });
    assert(r.ok, r.error);
    assert(r.count >= 5 && r.count <= 6, 'expected ~5 frames for 5.2 s, got ' + r.count);
    const [w, h] = probeSize(r.frames[0]);
    assert.strictEqual(w, 1280); assert.strictEqual(h, 720); assert.strictEqual(h % 2, 0);
    assert(progress.length && progress[progress.length - 1].percent === 100, 'final progress event');
  });

  await test('640x360 is not upscaled', async () => {
    const r = await call('video:extract', { jobId: 'small1', filePath: small });
    assert(r.ok, r.error); assert.deepStrictEqual(probeSize(r.frames[0]), [640, 360]);
  });

  await test('validation errors come back as { ok: false, error }', async () => {
    for (const bad of [
      { jobId: 'x1', filePath: 'relative/clip.mp4' },
      { jobId: 'x2', filePath: path.join(tmp, 'missing.mp4') },
      { jobId: 'x3', filePath: path.join(tmp, 'notes.txt') },
      { jobId: '../escape', filePath: big },
      { jobId: 'x4', filePath: tmp + '/' },
      null,
    ]) { const r = await call('video:extract', bad); assert(r.ok === false && typeof r.error === 'string', JSON.stringify(bad) + ' -> ' + JSON.stringify(r)); }
  });

  await test('corrupt video returns an ffmpeg error and leaves no partial dir', async () => {
    const f = path.join(tmp, 'corrupt.mp4'); fs.writeFileSync(f, 'this is not a video');
    const r = await call('video:extract', { jobId: 'bad1', filePath: f });
    assert(r.ok === false && r.error, JSON.stringify(r)); assert(!fs.existsSync(path.join(cacheDir, 'bad1')));
  });

  const realFfmpeg = process.env.CUE_FFMPEG;
  await test('cancel kills the process immediately and wipes partial output', async () => {
    process.env.CUE_FFMPEG = fake('hang.sh', 'exec sleep 60');
    const t0 = Date.now(); const p = call('video:extract', { jobId: 'cancel1', filePath: big });
    await new Promise((r) => setTimeout(r, 400));
    assert.deepStrictEqual(await call('video:cancel', 'cancel1'), { ok: true, cancelled: true });
    const r = await p;
    assert(r.ok === false && r.cancelled === true, JSON.stringify(r)); assert(Date.now() - t0 < 5000, 'took ' + (Date.now() - t0) + ' ms');
    assert(!fs.existsSync(path.join(cacheDir, 'cancel1')));
    assert.deepStrictEqual(await call('video:cancel', 'cancel1'), { ok: true, cancelled: false });
  });

  await test('stall watchdog stops a silent ffmpeg', async () => {
    process.env.CUE_FFMPEG = fake('silent.sh', 'exec sleep 60');
    const t0 = Date.now(); const r = await call('video:extract', { jobId: 'stall1', filePath: big });
    assert(r.ok === false && r.stalled === true, JSON.stringify(r));
    assert(Date.now() - t0 > 2000 && Date.now() - t0 < 9000, 'took ' + (Date.now() - t0) + ' ms');
  });

  await test('a chatty ffmpeg is not killed by the watchdog', async () => {
    process.env.CUE_FFMPEG = fake('chatty.sh', 'for i in 1 2 3 4 5; do echo "frame=$i"; echo "progress=continue"; sleep 1; done\nmkdir -p "$(dirname "$(eval echo \\${$#})")"; for last; do :; done; touch "$(dirname "$last")/frame_000001.jpg"');
    const r = await call('video:extract', { jobId: 'chatty1', filePath: big });
    assert(r.ok === true, JSON.stringify(r));
  });
  if (realFfmpeg) process.env.CUE_FFMPEG = realFfmpeg; else delete process.env.CUE_FFMPEG;

  await test('job cap and duplicate ids are rejected', async () => {
    process.env.CUE_FFMPEG = fake('hang2.sh', 'exec sleep 60');
    const a = call('video:extract', { jobId: 'cap1', filePath: big }), b = call('video:extract', { jobId: 'cap2', filePath: big });
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual((await call('video:extract', { jobId: 'cap3', filePath: big })).ok, false);
    assert.strictEqual((await call('video:extract', { jobId: 'cap1', filePath: big })).ok, false);
    await call('video:clearCache'); // also exercises cancel-all
    const [ra, rb] = await Promise.all([a, b]); assert(ra.cancelled && rb.cancelled);
    if (realFfmpeg) process.env.CUE_FFMPEG = realFfmpeg; else delete process.env.CUE_FFMPEG;
  });

  await test('clearCache wipes the cache and nothing else in userData', async () => {
    const keep = path.join(userData, 'cue-data.json'); fs.writeFileSync(keep, '{}');
    const r = await call('video:extract', { jobId: 'keep1', filePath: small }); assert(r.ok, r.error); assert(fs.existsSync(r.frames[0]));
    assert.deepStrictEqual(await call('video:clearCache'), { ok: true });
    assert(!fs.existsSync(cacheDir)); assert(fs.existsSync(keep));
    const again = await call('video:extract', { jobId: 'again1', filePath: small }); assert(again.ok, again.error); // recreates the cache lazily
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(process.exitCode ? '\nFAILED' : `\nall ${n} passed`);
})();
