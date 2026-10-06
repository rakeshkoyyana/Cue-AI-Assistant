// Cloud engines (main process): OpenAI / Google Gemini / Groq via the OpenAI-compatible Chat Completions API,
// Groq Whisper transcription, key checks, and local OCR for screenshots on text-only models.
const GROQ = () => (process.env.CUE_GROQ_URL || 'https://api.groq.com').replace(/\/$/, '') + '/openai/v1';
const BASES = {
  openai: () => process.env.CUE_OPENAI_URL || 'https://api.openai.com/v1',
  gemini: () => process.env.CUE_GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
  groq: GROQ,
};
const LABEL = { openai: 'OpenAI', gemini: 'Google Gemini', groq: 'Groq', anthropic: 'Anthropic' };

// Fastest-first fallbacks used when a model hits its free-tier rate limit.
const GROQ_MODELS = [
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B · best answers' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B · natural tone' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B · fastest' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B · highest daily limit' },
];
const FALLBACK = { 'openai/gpt-oss-120b': 'llama-3.3-70b-versatile', 'llama-3.3-70b-versatile': 'openai/gpt-oss-20b', 'openai/gpt-oss-20b': 'llama-3.1-8b-instant' };

class CloudError extends Error { constructor(msg, status, retryAfter) { super(msg); this.status = status; this.retryAfter = retryAfter; } }
async function apiError(res, what, provider = 'groq') {
  const body = await res.text().catch(() => ''); let msg = body; try { const j = JSON.parse(body); msg = (Array.isArray(j) ? j[0] : j).error?.message || body; } catch {}
  const ra = Number(res.headers.get('retry-after')) || null; const L = LABEL[provider];
  if (res.status === 401 || res.status === 403) return new CloudError(`Your ${L} key was rejected. Paste it again in Settings (⋮ menu).`, res.status);
  if (res.status === 429) return new CloudError(`${L} rate or credit limit reached for ${what}${ra ? ` — try again in ${ra}s` : ''}. ${provider === 'groq' ? '' : 'Check billing/credits on your ' + L + ' account.'}`.trim(), 429, ra);
  if (res.status === 413) return new CloudError('That request was too large. Try fewer documents or a smaller project folder.', 413);
  return new CloudError(`${L} error ${res.status}: ${String(msg).slice(0, 300)}`, res.status);
}
const groqError = (res, what) => apiError(res, what, 'groq');

// Streams an OpenAI-compatible chat completion (OpenAI, Gemini, Groq). Returns { ttft, tps, promptTokens, model }.
async function chatStream({ provider, key, model, system, messages, image, signal, onText, maxTokens = 1024 }) {
  const t0 = Date.now(); let tFirst = 0, usage = null, chars = 0, inThink = false;
  // drop any <think>…</think> reasoning a model streams inline — only the answer is shown
  const emit = (t) => { let out = ''; while (t) { if (inThink) { const i = t.indexOf('</think>'); if (i < 0) t = ''; else { inThink = false; t = t.slice(i + 8); } } else { const i = t.indexOf('<think>'); if (i < 0) { out += t; t = ''; } else { out += t.slice(0, i); inThink = true; t = t.slice(i + 7); } } } if (out) { if (!tFirst) tFirst = Date.now(); chars += out.length; onText(out); } };
  const msgs = [{ role: 'system', content: system }, ...messages.map((x, i) => (image && i === messages.length - 1 && x.role === 'user'
    ? { role: 'user', content: [{ type: 'text', text: x.content }, { type: 'image_url', image_url: { url: 'data:image/png;base64,' + image } }] } : x))];
  const body = { model, stream: true, messages: msgs, stream_options: { include_usage: true } };
  if (provider === 'openai') { body.max_completion_tokens = maxTokens; body.reasoning_effort = 'low'; }
  else { body.max_tokens = maxTokens; body.temperature = 0.4; if (provider === 'gemini' || /gpt-oss/.test(model)) body.reasoning_effort = 'low'; }
  if (provider === 'groq') delete body.stream_options;
  const call = () => fetch(BASES[provider]() + '/chat/completions', { method: 'POST', signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let res = await call();
  if (res.status === 400) { delete body.reasoning_effort; delete body.stream_options; delete body.temperature; res = await call(); } // model doesn't accept an optional field
  if (!res.ok) throw await apiError(res, model, provider);
  const reader = res.body.getReader(); const dc = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += dc.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
    for (const ln of lines) {
      const d = ln.trim(); if (!d.startsWith('data:')) continue; const p = d.slice(5).trim(); if (p === '[DONE]') continue;
      try { const j = JSON.parse(p); const t = j.choices?.[0]?.delta?.content; if (t) emit(t); usage = j.x_groq?.usage || j.usage || usage; } catch {}
    }
  }
  const secs = usage?.completion_time || (tFirst ? (Date.now() - tFirst) / 1000 : 0); const outTok = usage?.completion_tokens || Math.round(chars / 4);
  return { model, ttft: tFirst ? tFirst - t0 : null, promptTokens: usage?.prompt_tokens || null, tps: secs > 0.05 ? Math.round(outTok / secs) : null };
}

const groqChat = (o) => chatStream({ ...o, provider: 'groq' });
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
async function testKey(provider, key) {
  if (!key) return { ok: false, error: 'No key yet' };
  try {
    let r;
    if (provider === 'deepgram') r = await fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${key}` }, signal: AbortSignal.timeout(8000) });
    else if (provider === 'anthropic') r = await fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(8000) });
    else r = await fetch(BASES[provider]() + '/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    if (r.ok) return { ok: true };
    return { ok: false, error: r.status === 401 || r.status === 403 ? `${LABEL[provider] || 'Deepgram'} rejected that key.` : `${LABEL[provider] || 'Deepgram'} error ${r.status}` };
  } catch (e) { return { ok: false, error: `Could not reach ${LABEL[provider] || 'Deepgram'}: ${e.message}` }; }
}

// ---------- OCR for screenshots (Groq's text models can't see images) ----------
let ocrWorker = null;
async function ocr(base64, dir) {
  if (!ocrWorker) { const { createWorker } = require('tesseract.js'); ocrWorker = await createWorker('eng', 1, { cachePath: dir }); }
  const { data } = await ocrWorker.recognize(Buffer.from(base64, 'base64'));
  return (data.text || '').trim();
}
async function ocrStop() { try { await ocrWorker?.terminate(); } catch {} ocrWorker = null; }

module.exports = { GROQ_MODELS, chatStream, groqChatWithFallback, groqTranscribe, testKey, ocr, ocrStop, wav16k };
