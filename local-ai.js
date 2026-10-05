// Free, fully-local AI helpers (main process): Whisper speech-to-text, OCR, and Ollama utilities.
// Nothing here talks to a paid service. Models are downloaded once (Hugging Face / Ollama) and cached on disk.
const path = require('path');
const fs = require('fs');

// ---------------- Whisper (speech-to-text) ----------------
// 'fast' = tiny (~40 MB, ~4x cheaper than base) · 'balanced' = base (~80 MB, more accurate)
const STT_MODELS = { fast: { en: 'Xenova/whisper-tiny.en', multi: 'Xenova/whisper-tiny' }, balanced: { en: 'Xenova/whisper-base.en', multi: 'Xenova/whisper-base' } };
const LANG_NAME = { es: 'spanish', fr: 'french', de: 'german', hi: 'hindi', pt: 'portuguese', it: 'italian', nl: 'dutch', ja: 'japanese', ko: 'korean', zh: 'chinese', ru: 'russian' };
let cacheDir = '';
let pipe = null, pipeModel = '', loading = null, queue = Promise.resolve();

const sttModelFor = (lang, quality = 'fast') => STT_MODELS[quality === 'balanced' ? 'balanced' : 'fast'][!lang || lang === 'en' ? 'en' : 'multi'];
const marker = (model) => path.join(cacheDir, model.replace('/', '__') + '.ready');
const setCacheDir = (d) => { cacheDir = d; fs.mkdirSync(d, { recursive: true }); };
const sttReady = (lang, q) => fs.existsSync(marker(sttModelFor(lang, q)));

async function sttInit(lang, onProgress, quality) {
  const model = sttModelFor(lang, quality);
  if (pipe && pipeModel === model) return model;
  if (loading) { await loading; if (pipeModel === model) return model; }
  loading = (async () => {
    const tf = await import('@huggingface/transformers');
    tf.env.cacheDir = path.join(cacheDir, 'hf'); tf.env.allowLocalModels = false;
    const files = {};
    pipe = await tf.pipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
      session_options: { intraOpNumThreads: 4 }, // leave CPU headroom for the AI model and macOS
      progress_callback: (p) => {
        if (p.status === 'progress' && p.file) { files[p.file] = { loaded: p.loaded, total: p.total }; const v = Object.values(files); const tot = v.reduce((a, b) => a + b.total, 0); if (onProgress && tot) onProgress(Math.round((v.reduce((a, b) => a + b.loaded, 0) / tot) * 100)); }
      },
    });
    pipeModel = model; fs.writeFileSync(marker(model), String(Date.now()));
  })();
  try { await loading; } finally { loading = null; }
  return model;
}

const HALLUCINATIONS = /^\s*(thank you\.?|thanks for watching[.!]?|thanks\.?|you|bye\.?|okay\.?|\.+|\[[^\]]*\]|\([^)]*\)|♪.*|music)\s*$/i;
function sttTranscribe(samples, lang, quality) {
  const run = async () => {
    const t0 = Date.now();
    await sttInit(lang, null, quality);
    const audio = samples instanceof Float32Array ? samples : Float32Array.from(samples);
    const opts = { chunk_length_s: 30, return_timestamps: false };
    if (!pipeModel.endsWith('.en')) { opts.task = 'transcribe'; if (LANG_NAME[lang]) opts.language = LANG_NAME[lang]; }
    const out = await pipe(audio, opts);
    const text = String(out.text || '').trim();
    return { text: HALLUCINATIONS.test(text) ? '' : text, ms: Date.now() - t0 };
  };
  const p = queue.then(run, run); queue = p.catch(() => {}); return p; // one transcription at a time
}

// ---------------- OCR for screenshots (used when the local model has no vision) ----------------
let ocrWorker = null;
async function ocr(base64, dir) {
  if (!ocrWorker) {
    const { createWorker } = require('tesseract.js');
    ocrWorker = await createWorker('eng', 1, { cachePath: dir });
  }
  const { data } = await ocrWorker.recognize(Buffer.from(base64, 'base64'));
  return (data.text || '').trim();
}
async function ocrStop() { try { await ocrWorker?.terminate(); } catch {} ocrWorker = null; }

// ---------------- Ollama ----------------
const VISION_RE = /llava|vision|vl\b|-vl|moondream|minicpm-v|gemma[34]|qwen3\.[5-9]|bakllava|granite3\.2-vision|mistral-small3/i;
const isVision = (name) => VISION_RE.test(name);
async function ollamaTags(url) {
  const res = await fetch(url.replace(/\/$/, '') + '/api/tags', { signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return ((await res.json()).models || []).map((m) => m.name).filter((n) => !/embed/i.test(n));
}
// Loads the model into memory ahead of time so the first answer isn't slow.
// Optionally prefills the session's system prompt (num_predict 1) so Ollama caches it and the first real answer starts fast.
function ollamaWarm(url, name, system) { const body = system ? { model: name, stream: false, think: false, keep_alive: '30m', messages: [{ role: 'system', content: system }, { role: 'user', content: 'ok' }], options: { num_ctx: 8192, num_predict: 1 } } : { model: name, keep_alive: '30m' };
  return fetch(url.replace(/\/$/, '') + (system ? '/api/chat' : '/api/generate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.ok).catch(() => false); }
async function ollamaPull(url, name, onProgress) {
  const res = await fetch(url.replace(/\/$/, '') + '/api/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }) });
  if (!res.ok) throw new Error(`Ollama couldn't download ${name}: ${await res.text()}`);
  const reader = res.body.getReader(); const dc = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dc.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
    for (const ln of lines) { if (!ln.trim()) continue; try { const j = JSON.parse(ln); if (j.error) throw new Error(j.error); onProgress(j.total ? Math.round((j.completed || 0) / j.total * 100) : null, j.status); } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; } }
  }
}

module.exports = { setCacheDir, sttReady, sttInit, sttTranscribe, sttModelFor, ocr, ocrStop, ollamaTags, ollamaPull, ollamaWarm, isVision };
