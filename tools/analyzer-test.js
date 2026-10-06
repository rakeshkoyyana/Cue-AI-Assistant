// Plain-Node test for analyzer.js (no Electron, no network, no ffmpeg): `npm run test:analyzer`
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = require('../analyzer');
const cloud = require('../cloud');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cue-analyzer-test-'));
const cacheRoot = path.join(tmp, 'userData', 'video-cache');
const job = path.join(cacheRoot, 'job1');
fs.mkdirSync(job, { recursive: true });
const pad = (n) => String(n).padStart(6, '0');
const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('frame-' + n + '-'.repeat(50)), Buffer.from([0xff, 0xd9])]); // distinct fake JPEG per frame
for (let n = 1; n <= 10; n++) fs.writeFileSync(path.join(job, `frame_${pad(n)}.jpg`), jpeg(n)); // a 10 s video: seconds 0..9

const secret = path.join(tmp, 'secret'); fs.mkdirSync(secret);
fs.writeFileSync(path.join(secret, 'frame_000001.jpg'), jpeg(99)); // a valid-looking frame OUTSIDE the cache
fs.writeFileSync(path.join(secret, 'passwords.txt'), 'hunter2');

let n = 0;
const test = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); n++; } catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n       ')); process.exitCode = 1; } };
const rejects = async (p, re) => { let err; try { await p; } catch (e) { err = e; } assert(err, 'expected a rejection'); if (re) assert(re.test(err.message), 'unexpected message: ' + err.message); };
const opt = { cacheRoot };

(async () => {
  // ---- alignment ----
  await test('frame number = floor(timestamp) + 1 (frame_000001 covers second 0-1)', async () => {
    const m = await A.mergeContextTimeline([{ timestamp: 0, text: 'a' }, { timestamp: 0.9, text: 'b' }, { timestamp: 1, text: 'c' }, { timestamp: 4.99, text: 'd' }, { timestamp: 9, text: 'e' }], job, opt);
    assert.deepStrictEqual(m.map((x) => x.frameNumber), [1, 1, 2, 5, 10]);
    assert.deepStrictEqual(m.map((x) => x.frameFile), ['frame_000001.jpg', 'frame_000001.jpg', 'frame_000002.jpg', 'frame_000005.jpg', 'frame_000010.jpg']);
    assert.deepStrictEqual(m.map((x) => x.frameSecond), [0, 0, 1, 4, 9]); assert(m.every((x) => !x.clamped));
  });
  await test('timestamps past the end clamp to the last frame and are flagged', async () => {
    const [m] = await A.mergeContextTimeline([{ timestamp: 600, text: 'late' }], job, opt);
    assert.strictEqual(m.frameNumber, 10); assert.strictEqual(m.clamped, true);
  });
  await test('output is sorted by time; malformed lines are dropped; text is trimmed', async () => {
    const m = await A.mergeContextTimeline([{ timestamp: 5, text: ' later ' }, { timestamp: 2, text: 'earlier', speaker: ' Me ' }, { timestamp: -1, text: 'neg' }, { timestamp: NaN, text: 'nan' }, { timestamp: 3, text: '   ' }, { timestamp: '4', text: 'stringy' }, null, 'x', { text: 'no ts' }], job, opt);
    assert.deepStrictEqual(m.map((x) => [x.timestamp, x.text, x.speaker]), [[2, 'earlier', 'Me'], [4, 'stringy', undefined], [5, 'later', undefined]]);
  });
  await test('gaps in the frame sequence resolve to the nearest frame', async () => {
    const g = path.join(cacheRoot, 'gappy'); fs.mkdirSync(g); for (const k of [1, 2, 7, 8]) fs.writeFileSync(path.join(g, `frame_${pad(k)}.jpg`), jpeg(k));
    const m = await A.mergeContextTimeline([{ timestamp: 2.2, text: 'x' }, { timestamp: 4.2, text: 'y' }, { timestamp: 5.2, text: 'z' }], g, opt); // wanted 3, 5, 6
    assert.deepStrictEqual(m.map((x) => x.frameNumber), [2, 7, 7]);
  });
  await test('rejects non-array input and oversized timelines', async () => {
    await rejects(A.mergeContextTimeline('nope', job, opt), /array/); await rejects(A.mergeContextTimeline(new Array(5001).fill({ timestamp: 1, text: 'x' }), job, opt), /Too many/);
  });

  // ---- path safety ----
  await test('rejects a frame folder outside the cache (absolute, traversal, sibling prefix)', async () => {
    await rejects(A.mergeContextTimeline([], secret, opt), /outside the video cache/);
    await rejects(A.mergeContextTimeline([], path.join(job, '..', '..', '..', 'secret'), opt), /outside the video cache/); // job/../../../secret = the real outside folder
    const evil = cacheRoot + '-evil'; fs.mkdirSync(evil); fs.writeFileSync(path.join(evil, 'frame_000001.jpg'), jpeg(1));
    await rejects(A.mergeContextTimeline([], evil, opt), /outside the video cache/);
    await rejects(A.mergeContextTimeline([], cacheRoot, opt), /outside the video cache/); // the root itself is not a job folder
  });
  await test('rejects a symlinked folder that points outside the cache', async () => {
    fs.symlinkSync(secret, path.join(cacheRoot, 'linked')); await rejects(A.mergeContextTimeline([], path.join(cacheRoot, 'linked'), opt), /outside the video cache/);
  });
  await test('a symlink planted among the frames is never listed or read', async () => {
    const d = path.join(cacheRoot, 'planted'); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'frame_000001.jpg'), jpeg(1)); fs.symlinkSync(path.join(secret, 'frame_000001.jpg'), path.join(d, 'frame_000002.jpg'));
    const m = await A.mergeContextTimeline([{ timestamp: 1.5, text: 'x' }], d, opt); assert.strictEqual(m[0].frameNumber, 1); // frame 2 is the link, so it is skipped
    await rejects(A.readFrame(cacheRoot, path.join(d, 'frame_000002.jpg')), /outside the video cache/);
  });
  await test('readFrame refuses non-frame names, non-JPEG content, empty and oversized files, and missing files', async () => {
    await rejects(A.readFrame(cacheRoot, path.join(secret, 'passwords.txt')), /Not a frame file/);
    await rejects(A.readFrame(cacheRoot, path.join(job, '..', '..', '..', 'secret', 'frame_000001.jpg')), /outside the video cache|not found/);
    fs.writeFileSync(path.join(job, 'frame_000011.jpg'), 'GIF89a not a jpeg at all'); await rejects(A.readFrame(cacheRoot, path.join(job, 'frame_000011.jpg')), /not a JPEG/);
    fs.writeFileSync(path.join(job, 'frame_000012.jpg'), ''); await rejects(A.readFrame(cacheRoot, path.join(job, 'frame_000012.jpg')), /size/);
    fs.writeFileSync(path.join(job, 'frame_000013.jpg'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5 * 1024 * 1024)])); await rejects(A.readFrame(cacheRoot, path.join(job, 'frame_000013.jpg')), /size/);
    await rejects(A.readFrame(cacheRoot, path.join(job, 'frame_000099.jpg')), /not found/);
    for (const k of [11, 12, 13]) fs.rmSync(path.join(job, `frame_${pad(k)}.jpg`));
  });
  await test('a missing cache says so instead of leaking paths', async () => { await rejects(A.mergeContextTimeline([], job, { cacheRoot: path.join(tmp, 'nope') }), /process a video first/); });

  // ---- packaging ----
  const tx = [{ timestamp: 3, text: 'old line', speaker: 'Interviewer' }, { timestamp: 20, text: 'inside window', speaker: 'You' }, { timestamp: 25.5, text: 'at the moment' }, { timestamp: 40, text: 'after' }];
  await test('slice = transcript window up to atSeconds + the matching frame as base64 JPEG', async () => {
    const s = await A.packageDiagnosticSlice({ transcripts: tx, frameDirectory: job, atSeconds: 25.5, windowSeconds: 10 }, opt);
    assert.strictEqual(s.text, '[0:20] You: inside window\n[0:25] at the moment'); assert.deepStrictEqual(s.window, { from: 15.5, to: 25.5, lines: 2 });
    assert.strictEqual(s.frame.number, 10); assert.strictEqual(s.frame.clamped, true); assert.strictEqual(s.frame.mediaType, 'image/jpeg');
    assert(Buffer.from(s.frame.base64, 'base64').equals(jpeg(10)), 'base64 must round-trip to the exact bytes of frame_000010.jpg');
  });
  await test('in-range moment picks that second\'s frame; default window is 30 s; default atSeconds is the latest line', async () => {
    const s = await A.packageDiagnosticSlice({ transcripts: [{ timestamp: 2, text: 'hi' }, { timestamp: 4.7, text: 'there' }], frameDirectory: job }, opt);
    assert.strictEqual(s.frame.number, 5); assert.strictEqual(s.window.to, 4.7); assert.strictEqual(s.window.lines, 2); assert(Buffer.from(s.frame.base64, 'base64').equals(jpeg(5)));
  });
  await test('no speech in the window is allowed; bad atSeconds is not', async () => {
    const s = await A.packageDiagnosticSlice({ transcripts: [], frameDirectory: job, atSeconds: 3 }, opt); assert.strictEqual(s.text, ''); assert.strictEqual(s.frame.number, 4);
    await rejects(A.packageDiagnosticSlice({ transcripts: [], frameDirectory: job }, opt), /atSeconds is required/);
    await rejects(A.packageDiagnosticSlice({ transcripts: [], frameDirectory: job, atSeconds: 'soon' }, opt), /atSeconds must be/);
    await rejects(A.packageDiagnosticSlice({ transcripts: [], frameDirectory: job, atSeconds: -4 }, opt), /atSeconds must be/);
  });
  await test('window text is capped to the most recent 12k characters', async () => {
    const big = Array.from({ length: 40 }, (_, i) => ({ timestamp: i / 10, text: 'x'.repeat(1900) + i }));
    const s = await A.packageDiagnosticSlice({ transcripts: big, frameDirectory: job, atSeconds: 4 }, opt); assert(s.text.length <= 12001 && s.text.startsWith('…') && s.text.endsWith('39'));
  });

  // ---- model call + IPC ----
  const calls = []; const ask = async (a) => { calls.push(a); return { text: ' The screen shows a slide. ', stats: { model: 'fake:model' } }; };
  const handlers = {}; const ipcMain = { handle: (ch, fn) => (handlers[ch] = fn) };
  A.register({ ipcMain, ask, cacheRoot: () => cacheRoot });
  const call = (ch, o) => handlers[ch]({}, o);

  await test('analyzer:run sends one JPEG frame + the excerpt to the model and returns text, never image bytes', async () => {
    const r = await call('analyzer:run', { jobId: 'job1', transcripts: tx, atSeconds: 25.5, windowSeconds: 10, question: 'What slide is this?', model: 'anthropic:claude-sonnet-5-5' });
    assert.strictEqual(r.ok, true, JSON.stringify(r)); assert.strictEqual(r.text, 'The screen shows a slide.'); assert.deepStrictEqual(r.frame, { number: 10, second: 9, name: 'frame_000010.jpg', mediaType: 'image/jpeg', bytes: jpeg(10).length, clamped: true });
    assert(!JSON.stringify(r).includes(jpeg(10).toString('base64')), 'image bytes must not be in the reply');
    const a = calls[0]; assert.strictEqual(a.imageType, 'image/jpeg'); assert.strictEqual(a.model, 'anthropic:claude-sonnet-5-5'); assert(Buffer.from(a.image, 'base64').equals(jpeg(10)));
    assert(/untrusted data/.test(a.system)); assert(/inside window/.test(a.messages[0].content) && /What slide is this\?/.test(a.messages[0].content) && !/old line/.test(a.messages[0].content));
  });
  await test('analyzer:run ignores a malformed model name and uses the default question', async () => {
    await call('analyzer:run', { jobId: 'job1', transcripts: tx, atSeconds: 5, model: 'x; rm -rf /' }); const a = calls[calls.length - 1];
    assert.strictEqual(a.model, undefined); assert(/What is happening at this moment/.test(a.messages[0].content));
  });
  await test('analyzer:timeline returns aligned entries and frame stats', async () => {
    const r = await call('analyzer:timeline', { jobId: 'job1', transcripts: [{ timestamp: 3.2, text: 'x' }] });
    assert.strictEqual(r.ok, true); assert.deepStrictEqual(r.frames, { count: 10, first: 1, last: 10, durationSec: 10 }); assert.strictEqual(r.entries[0].frameNumber, 4);
  });
  await test('IPC takes a jobId, never a path: traversal and absolute paths are rejected as { ok: false }', async () => {
    for (const jobId of ['../secret', secret, 'job1/../../secret', '', null, undefined, 'a'.repeat(65)]) { const r = await call('analyzer:run', { jobId, transcripts: tx, atSeconds: 1 }); assert.strictEqual(r.ok, false, String(jobId)); assert.strictEqual(typeof r.error, 'string'); }
    assert.strictEqual((await call('analyzer:run', null)).ok, false); assert.strictEqual((await call('analyzer:run', { jobId: 'nojob', transcripts: [], atSeconds: 1 })).ok, false);
    assert(!calls.some((c) => Buffer.from(c.image, 'base64').equals(jpeg(99))), 'the outside-the-cache frame must never reach the model');
  });
  await test('model errors and empty answers come back as { ok: false, error }', async () => {
    const h2 = {}; A.register({ ipcMain: { handle: (c, f) => (h2[c] = f) }, ask: async () => { throw new Error('Anthropic rate limit'); }, cacheRoot });
    assert.deepStrictEqual(await h2['analyzer:run']({}, { jobId: 'job1', transcripts: tx, atSeconds: 5 }), { ok: false, error: 'Anthropic rate limit' });
    const h3 = {}; A.register({ ipcMain: { handle: (c, f) => (h3[c] = f) }, ask: async () => ({ text: '  ' }), cacheRoot });
    assert.strictEqual((await h3['analyzer:run']({}, { jobId: 'job1', transcripts: tx, atSeconds: 5 })).ok, false);
  });
  await test('at most 2 analyses run at once', async () => {
    let release; const gate = new Promise((r) => (release = r)); const h = {}; A.register({ ipcMain: { handle: (c, f) => (h[c] = f) }, ask: async () => { await gate; return { text: 'ok' }; }, cacheRoot });
    const run = () => h['analyzer:run']({}, { jobId: 'job1', transcripts: tx, atSeconds: 5 }); const a = run(), b = run(); await new Promise((r) => setTimeout(r, 50));
    const c = await run(); assert.strictEqual(c.ok, false); assert(/still running/.test(c.error)); release(); assert((await a).ok && (await b).ok); assert((await run()).ok);
  });

  // ---- cloud.js carries the right media type ----
  await test('cloud.chatStream labels the image with its real type (default stays PNG)', async () => {
    const realFetch = global.fetch; const bodies = [];
    global.fetch = async (_u, init) => { bodies.push(JSON.parse(init.body)); return { status: 200, ok: true, body: { getReader: () => ({ read: async () => ({ done: true }) }) } }; };
    try {
      const base = { provider: 'openai', key: 'k', model: 'm', system: 's', messages: [{ role: 'user', content: 'q' }], image: 'QUJD', onText() {} };
      await cloud.chatStream({ ...base, imageType: 'image/jpeg' }); await cloud.chatStream(base);
      const url = (b) => b.messages[1].content[1].image_url.url; assert.strictEqual(url(bodies[0]), 'data:image/jpeg;base64,QUJD'); assert.strictEqual(url(bodies[1]), 'data:image/png;base64,QUJD');
    } finally { global.fetch = realFetch; }
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(process.exitCode ? '\nFAILED' : `\nall ${n} passed`);
})();
