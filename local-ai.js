// Free, fully-local AI helpers (main process): Whisper speech-to-text, OCR, and Ollama utilities.
// Nothing here talks to a paid service. Models are downloaded once (Hugging Face / Ollama) and cached on disk.
const path = require('path');
const fs = require('fs');

// ---------------- Whisper (speech-to-text) ----------------
const STT_MODELS = { en: 'Xenova/whisper-base.en', multi: 'Xenova/whisper-base' };
const LANG_NAME = { es: 'spanish', fr: 'french', de: 'german', hi: 'hindi', pt: 'portuguese', it: 'italian', nl: 'dutch', ja: 'japanese', ko: 'korean', zh: 'chinese', ru: 'russian' };
let cacheDir = '';
let pipe = null, pipeModel = '', loading = null, queue = Promise.resolve();

const sttModelFor = (lang) => (!lang || lang === 'en' ? STT_MODELS.en : STT_MODELS.multi);
const marker = (model) => path.join(cacheDir, model.replace('/', '__') + '.ready');
const setCacheDir = (d) => { cacheDir = d; fs.mkdirSync(d, { recursive: true }); };
const sttReady = (lang) => fs.existsSync(marker(sttModelFor(lang)));

async function sttInit(lang, onProgress) {
  const model = sttModelFor(lang);
  if (pipe && pipeModel === model) return model;
  if (loading) { await loading; if (pipeModel === model) return model; }
  loading = (async () => {
    const tf = await import('@huggingface/transformers');
    tf.env.cacheDir = path.join(cacheDir, 'hf'); tf.env.allowLocalModels = false;
    const files = {};
    pipe = await tf.pipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
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
function sttTranscribe(samples, lang) {
  const run = async () => {
    await sttInit(lang);
    const audio = samples instanceof Float32Array ? samples : Float32Array.from(samples);
    const opts = { chunk_length_s: 30, return_timestamps: false };
    if (pipeModel === STT_MODELS.multi) { opts.task = 'transcribe'; if (LANG_NAME[lang]) opts.language = LANG_NAME[lang]; }
    const out = await pipe(audio, opts);
    const text = String(out.text || '').trim();
    return HALLUCINATIONS.test(text) ? '' : text;
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
function ollamaWarm(url, name) { return fetch(url.replace(/\/$/, '') + '/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, keep_alive: '30m' }) }).then(() => true).catch(() => false); }
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
