// Fast cloud engines (main process): Groq for answers + Whisper transcription, key checks, and local OCR for screenshots.
const GROQ = () => (process.env.CUE_GROQ_URL || 'https://api.groq.com').replace(/\/$/, '') + '/openai/v1';

// Fastest-first fallbacks used when a model hits its free-tier rate limit.
const GROQ_MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B · best answers' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B · natural tone' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B · fastest' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B · highest daily limit' },
];
const FALLBACK = { 'openai/gpt-oss-120b': 'llama-3.3-70b-versatile', 'llama-3.3-70b-versatile': 'openai/gpt-oss-20b', 'openai/gpt-oss-20b': 'llama-3.1-8b-instant' };

class CloudError extends Error { constructor(msg, status, retryAfter) { super(msg); this.status = status; this.retryAfter = retryAfter; } }
async function groqError(res, what) {
  const body = await res.text().catch(() => ''); let msg = body; try { msg = JSON.parse(body).error?.message || body; } catch {}
  const ra = Number(res.headers.get('retry-after')) || null;
  if (res.status === 401) return new CloudError('Your Groq key was rejected. Paste it again in Setup (⋮ menu).', 401);
  if (res.status === 429) return new CloudError(`Groq free-tier limit reached for ${what}${ra ? ` — try again in ${ra}s` : ''}.`, 429, ra);
  if (res.status === 413) return new CloudError('That request was too large for the free tier. Try fewer documents or a smaller project folder.', 413);
  return new CloudError(`Groq error ${res.status}: ${String(msg).slice(0, 300)}`, res.status);
}

// Streams a chat completion. Returns { ttft, tps, promptTokens, model }.
async function groqChat({ key, model, system, messages, signal, onText, maxTokens = 1024 }) {
  const t0 = Date.now(); let tFirst = 0, usage = null;
  const body = { model, stream: true, temperature: 0.4, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] };
  if (/gpt-oss/.test(model)) body.reasoning_effort = 'low'; // keep the hidden reasoning short so answers start immediately
  let res = await fetch(GROQ() + '/chat/completions', { method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 400 && body.reasoning_effort) { delete body.reasoning_effort; res = await fetch(GROQ() + '/chat/completions', { method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  if (!res.ok) throw await groqError(res, model);
  const reader = res.body.getReader(); const dc = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dc.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
    for (const ln of lines) {
      const d = ln.trim(); if (!d.startsWith('data:')) continue; const p = d.slice(5).trim(); if (p === '[DONE]') continue;
      try { const j = JSON.parse(p); const t = j.choices?.[0]?.delta?.content; if (t) { if (!tFirst) tFirst = Date.now(); onText(t); } usage = j.x_groq?.usage || j.usage || usage; } catch {}
    }
  }
  return { model, ttft: tFirst ? tFirst - t0 : null, promptTokens: usage?.prompt_tokens || null,
    tps: usage?.completion_tokens && usage?.completion_time ? Math.round(usage.completion_tokens / usage.completion_time) : null };
}
// Same, but steps down to a lighter model if the chosen one is rate-limited (only before any text was streamed).
async function groqChatWithFallback(opts) {
  let model = opts.model, streamed = false;
  for (;;) {
    try { return await groqChat({ ...opts, model, onText: (t) => { streamed = true; opts.onText(t); } }); }
    catch (e) { if (e.status === 429 && !streamed && FALLBACK[model]) { model = FALLBACK[model]; continue; } throw e; }
  }
}

// ---------- speech-to-text (Groq Whisper) ----------
function wav16k(f32) { // mono 16-bit PCM WAV
  const b = Buffer.alloc(44 + f32.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + f32.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.max(-1, Math.min(1, f32[i])) * 0x7fff | 0, 44 + i * 2);
  return b;
}
const HALLUCINATIONS = /^\s*(thank you\.?|thanks for watching[.!]?|thanks\.?|you|bye\.?|okay\.?|\.+|\[[^\]]*\]|\([^)]*\)|♪.*|music)\s*$/i;
async function groqTranscribe(key, samples, lang) {
  const t0 = Date.now(); const audio = samples instanceof Float32Array ? samples : Float32Array.from(samples);
  const fd = new FormData();
  fd.append('file', new Blob([wav16k(audio)], { type: 'audio/wav' }), 'speech.wav');
  fd.append('model', 'whisper-large-v3-turbo'); fd.append('response_format', 'json'); fd.append('temperature', '0');
  if (lang) fd.append('language', lang);
  const res = await fetch(GROQ() + '/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!res.ok) throw await groqError(res, 'transcription');
  const text = String((await res.json()).text || '').trim();
  return { text: HALLUCINATIONS.test(text) ? '' : text, ms: Date.now() - t0 };
}

// ---------- key checks ----------
async function testGroq(key) {
  if (!key) return { ok: false, error: 'No key yet' };
  try { const r = await fetch(GROQ() + '/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) }); return r.ok ? { ok: true } : { ok: false, error: (await groqError(r, 'key check')).message }; }
  catch (e) { return { ok: false, error: 'Could not reach Groq: ' + e.message }; }
}
async function testDeepgram(key) {
  if (!key) return { ok: false, error: 'No key yet' };
  try { const r = await fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${key}` }, signal: AbortSignal.timeout(8000) }); return r.ok ? { ok: true } : { ok: false, error: r.status === 401 || r.status === 403 ? 'Deepgram rejected that key.' : `Deepgram error ${r.status}` }; }
  catch (e) { return { ok: false, error: 'Could not reach Deepgram: ' + e.message }; }
}

// ---------- OCR for screenshots (Groq's text models can't see images) ----------
let ocrWorker = null;
async function ocr(base64, dir) {
  if (!ocrWorker) { const { createWorker } = require('tesseract.js'); ocrWorker = await createWorker('eng', 1, { cachePath: dir }); }
  const { data } = await ocrWorker.recognize(Buffer.from(base64, 'base64'));
  return (data.text || '').trim();
}
async function ocrStop() { try { await ocrWorker?.terminate(); } catch {} ocrWorker = null; }

module.exports = { GROQ_MODELS, groqChatWithFallback, groqTranscribe, testGroq, testDeepgram, ocr, ocrStop, wav16k };
