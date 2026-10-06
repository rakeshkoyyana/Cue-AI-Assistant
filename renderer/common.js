const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODE = new URLSearchParams(location.search).get('mode') === 'dashboard' ? 'dashboard' : 'widget';
document.body.dataset.mode = MODE;
const app = $('#app');

const fmtDate = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
const fmtKB = (n) => (n > 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? '<1 min' : m + ' min'; };
const clean = (s) => String(s || '').replace(/\*\*/g, '').trim(); // some job imports contain stray markdown

function toast(msg, ms = 3000) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), ms); }
function modal(html, onMount) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="box">${html}</div>`;
  m.addEventListener('mousedown', (e) => { if (e.target === m) m.remove(); });
  document.body.appendChild(m); if (onMount) onMount(m.firstChild, () => m.remove()); return m;
}
function textModal(title, text) { modal(`<div class="row"><b class="grow">${esc(title)}</b><button class="btn ghost sm" data-x>Close</button></div><div class="gap"></div><pre class="txt">${esc(text)}</pre>`, (b, close) => $('[data-x]', b).onclick = close); }
// safe markdown: escape everything, then render ``` fences and **bold**
function md(src) {
  return String(src).split(/```/).map((p, i) => (i % 2 ? `<pre>${esc(p.replace(/^\w*\n/, ''))}</pre>` : esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>'))).join('');
}
function applyTheme(t) { if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }
applyTheme('dark');
function popMenu(anchor, html, onMount) {
  $$('.menu').forEach((x) => x.remove());
  const m = document.createElement('div'); m.className = 'menu'; m.innerHTML = html; document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(); m.style.top = r.bottom + 6 + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - 258, r.right - 250)) + 'px';
  const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true));
  onMount(m, () => { m.remove(); document.removeEventListener('mousedown', off, true); });
}

// Sorting shared by the widget and the dashboard
const SORTS = [['status', 'Status'], ['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'Title A–Z'], ['za', 'Title Z–A']];
const STATUS_RANK = { live: 0, ready: 1, ended: 2 };
const titleOf = (x) => clean(x.company || x.title || x.name || '').toLowerCase();
function sortRows(rows, mode, dateOf = (x) => x.createdAt || x.addedAt || 0) {
  const r = [...rows];
  if (mode === 'status') return r.sort((a, b) => (STATUS_RANK[a.status] ?? 1) - (STATUS_RANK[b.status] ?? 1) || dateOf(b) - dateOf(a));
  if (mode === 'old') return r.sort((a, b) => dateOf(a) - dateOf(b));
  if (mode === 'az') return r.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
  if (mode === 'za') return r.sort((a, b) => titleOf(b).localeCompare(titleOf(a)));
  return r.sort((a, b) => dateOf(b) - dateOf(a));
}
const sortSessions = (rows, mode) => sortRows(rows, mode);
function sortMenu(anchor, cur, onPick, options = SORTS) {
  popMenu(anchor, `<div class="it mute">Sort by</div>${options.map(([v, l]) => `<div class="it" data-s="${v}"><span class="grow">${l}</span>${v === cur ? ic('check', 15) : ''}</div>`).join('')}`, (m, close) => {
    m.onclick = (e) => { const it = e.target.closest('[data-s]'); if (!it) return; close(); onPick(it.dataset.s); };
  });
}
const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian' };
// Free local AI is always first; cloud models only appear once an API key has been added (optional, future scope).
// Answer models by provider. A provider's models are selectable once its key is added in Settings.
const PROVIDERS = [ // only strong, fast models — weaker ones are intentionally not offered
  { id: 'gemini', name: 'Google Gemini', key: 'geminiKey', url: 'https://aistudio.google.com/apikey', note: 'free tier — best free option; free-tier prompts may be used by Google', models: [['gemini-3.8-flash', 'Gemini 3.8 Flash · best free'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite · fastest free']] },
  { id: 'openai', name: 'OpenAI', key: 'openaiKey', url: 'https://platform.openai.com/api-keys', note: 'paid, pay-per-use', models: [['gpt-5.6-luna', 'GPT-5.6 Luna']] },
  { id: 'anthropic', name: 'Anthropic Claude', key: 'anthropicKey', url: 'https://console.anthropic.com/settings/keys', note: 'paid, pay-per-use', models: [['claude-haiku-4-5-20251001', 'Claude Haiku 4.5 · fast'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 · best']] },
  { id: 'groq', name: 'Groq', key: 'groqKey', url: 'https://console.groq.com/keys', note: 'free tier — automatic backup + captions without Deepgram', models: [['openai/gpt-oss-120b', 'GPT-OSS 120B · free backup']] },
];
const modelList = (S = {}) => PROVIDERS.flatMap((p) => p.models.map(([id, label]) => ({ id: `${p.id}:${id}`, label: `${p.name} — ${label}`, disabled: !S[p.key] })));
const modelOptions = (S, sel) => { const list = modelList(S); const cur = sel || S.defaultModel || (list.find((m) => !m.disabled) || {}).id || '';
  return `<option value="">Default (${esc((list.find((m) => m.id === S.defaultModel) || {}).label || 'first engine with a key')})</option>` + list.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''} ${m.disabled ? 'disabled' : ''}>${esc(m.label)}${m.disabled ? ' (add key)' : ''}</option>`).join(''); };
const brandHTML = () => `${mark(BRAND.mark, 22)}<span>${BRAND.name}</span>${BRAND.suffix ? `<span class="ai">${BRAND.suffix}</span>` : ''}`;

// Live transcription over Deepgram's streaming API. One Channel per audio source.
class Channel {
  constructor(label, onLine, onInterim, lang, key) { Object.assign(this, { label, onLine, onInterim, lang, key }); }
  async start(stream) {
    const url = `wss://api.deepgram.com/v1/listen?model=nova-3&language=${encodeURIComponent(this.lang)}&smart_format=true&interim_results=true&endpointing=500`;
    this.ws = new WebSocket(url, ['token', this.key]);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('Deepgram connection failed — check your key in Settings')); });
    this.ws.onmessage = (m) => {
      const j = JSON.parse(m.data); const alt = j.channel?.alternatives?.[0]; if (!alt?.transcript) return;
      if (j.is_final) this.onLine(this.label, alt.transcript); else this.onInterim(this.label, alt.transcript);
    };
    this.stream = stream;
    this.rec = new MediaRecorder(new MediaStream(stream.getAudioTracks()), { mimeType: 'audio/webm;codecs=opus' });
    this.rec.ondataavailable = (e) => { if (e.data.size && this.ws.readyState === 1) this.ws.send(e.data); };
    this.rec.start(250);
    this.keep = setInterval(() => this.ws.readyState === 1 && this.ws.send(JSON.stringify({ type: 'KeepAlive' })), 8000);
  }
  stop() { clearInterval(this.keep); try { this.rec?.stop(); } catch {} try { this.ws?.close(); } catch {} this.stream?.getTracks().forEach((t) => t.stop()); }
}

// ---------- model/engine setup checklist (used on the Connect and Settings screens) ----------
// ---------- engine status checklist (Connect screen, Settings, dashboard) ----------
async function setupPanel(host) {
  const st = await cue.setup.status(); const P = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
  const row = (id, icon, title, msg, cls = '') => `<div class="chk ${cls}" id="${id}"><div class="st">${ic(icon, 16, icon === 'loader-circle' ? 'spin' : '')}</div><div class="grow"><div class="t">${title}</div><div class="s">${msg}</div></div></div>`;
  const answer = st.answer ? row('ansRow', 'loader-circle', `Answers · ${P[st.answer.provider].name}`, 'Checking your key…')
    : row('ansRow', 'circle-alert', 'Answers · no AI key yet', 'Add an OpenAI, Google Gemini or Anthropic key below (or a free Groq key).', 'warn');
  const caps = st.captions === 'deepgram' ? row('capRow', 'loader-circle', 'Live captions · Deepgram', 'Checking your key…')
    : st.captions === 'groq' ? row('capRow', 'audio-lines', 'Captions · Groq Whisper (sentence by sentence)', 'For live word-by-word captions like Parakeet, add a Deepgram key below — new accounts get $200 free credit.', 'warn')
      : row('capRow', 'circle-alert', 'Captions · no transcription key yet', 'Add a Deepgram key below for live word-by-word captions ($200 free credit).', 'warn');
  host.innerHTML = answer + caps;
  const mark = (sel, ok, title, msg) => { const r = $(sel, host); if (!r) return; r.className = 'chk ' + (ok ? 'ok' : 'warn'); r.querySelector('.st').innerHTML = ic(ok ? 'check' : 'circle-alert', 16); r.querySelector('.t').textContent = title; r.querySelector('.s').innerHTML = msg; };
  if (st.answer) cue.setup.test(st.answer.provider).then((r) => mark('#ansRow', r.ok, `Answers · ${P[st.answer.provider].name}`, r.ok ? `Using <b>${esc(st.answer.name)}</b>. Change the default model below.` : esc(r.error)));
  if (st.captions === 'deepgram') cue.setup.test('deepgram').then((r) => mark('#capRow', r.ok, 'Live captions · Deepgram Nova-3', r.ok ? 'Word-by-word live transcription of you and the other side.' : esc(r.error)));
  return st;
}
// Settings form shared by the widget and the dashboard: one key field per provider + default model.
const settingsFormHTML = (S) => `<div id="chk"></div>
  <div class="sechd">Answer engines</div>
  ${PROVIDERS.map((p) => `<label class="lbl" style="display:flex;align-items:center;gap:8px">${p.name} <small>(${p.note})</small><span class="grow"></span><button class="btn ghost sm" data-open="${p.url}" style="height:24px">${ic('external-link', 12)}Get key</button></label><input id="${p.key}" type="password" value="${esc(S[p.key])}" placeholder="Paste ${p.name} API key" />`).join('')}
  <label class="lbl">Default answer model</label><select id="defaultModel"></select>
  <div class="sechd">Live captions</div>
  <label class="lbl" style="display:flex;align-items:center;gap:8px">Deepgram <small>(live word-by-word, $200 free credit)</small><span class="grow"></span><button class="btn ghost sm" data-open="https://console.deepgram.com/signup" style="height:24px">${ic('external-link', 12)}Get key</button></label><input id="deepgramKey" type="password" value="${esc(S.deepgramKey)}" placeholder="Paste Deepgram API key" />
  <p class="mute" style="font-size:12px;margin:10px 0 0">Without Deepgram, captions use Groq Whisper (needs the Groq key) and appear after each sentence. Keys are encrypted with your OS keychain and only sent to that provider.</p>`;
function bindSettingsForm(root, S) {
  const fill = () => { const sel = $('#defaultModel', root); const cur = S.defaultModel; sel.innerHTML = modelList(S).map((m) => `<option value="${m.id}" ${m.id === cur ? 'selected' : ''} ${m.disabled ? 'disabled' : ''}>${esc(m.label)}${m.disabled ? ' (add key)' : ''}</option>`).join(''); if (!cur || sel.selectedOptions[0]?.disabled) { const f = modelList(S).find((m) => !m.disabled); if (f) sel.value = f.id; } };
  fill(); setupPanel($('#chk', root));
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) { e.preventDefault(); cue.setup.open(b.dataset.open); } });
  PROVIDERS.forEach((p) => ($('#' + p.key, root).oninput = (e) => { S = { ...S, [p.key]: e.target.value }; fill(); }));
  return async () => {
    const patch = { defaultModel: $('#defaultModel', root).value, deepgramKey: $('#deepgramKey', root).value }; PROVIDERS.forEach((p) => (patch[p.key] = $('#' + p.key, root).value));
    const saved = await cue.settings.set(patch); await setupPanel($('#chk', root)); return saved;
  };
}

// Transcription by speech segments: a simple voice-activity detector cuts each sentence (~0.7 s of silence ends it)
// and sends it to Groq Whisper. Shows "…" while someone is talking.
class SegmentChannel {
  constructor(label, onLine, onInterim, lang) { Object.assign(this, { label, onLine, onInterim, lang }); this.tx = (a, l) => cue.stt.transcribe(a, l); this.onPerf = null; }
  async start(stream) {
    this.stream = stream; this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule('pcm-worklet.js');
    const src = this.ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    this.node = new AudioWorkletNode(this.ctx, 'pcm'); src.connect(this.node);
    Object.assign(this, { acc: [], accN: 0, pre: [], seg: [], speech: false, quiet: 0, voiced: 0, noise: 0.004, sinceInterim: 0, seq: 0, pending: false, level: 0 });
    this.node.port.onmessage = (e) => this.feed(e.data);
  }
  feed(block) {
    this.acc.push(block); this.accN += block.length; if (this.accN < 1600) return; // 100 ms frames
    const f = new Float32Array(this.accN); let o = 0; for (const b of this.acc) { f.set(b, o); o += b.length; } this.acc = []; this.accN = 0;
    let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i] * f[i]; const rms = Math.sqrt(sum / f.length); this.level = rms;
    const loud = rms > Math.max(0.012, this.noise * 3);
    if (!this.speech) { this.noise = this.noise * 0.95 + rms * 0.05; this.pre.push(f); if (this.pre.length > 3) this.pre.shift(); }
    if (loud) {
      if (!this.speech) { this.speech = true; this.seg = [...this.pre]; this.pre = []; this.voiced = 0; this.sinceInterim = 0; this.seq++; this.onInterim(this.label, '…'); }
      this.seg.push(f); this.quiet = 0; this.voiced++; this.sinceInterim++;
    } else if (this.speech) {
      this.seg.push(f); this.quiet++;
      if (this.quiet >= 7) return this.finish();
    }
    if (this.speech && this.seg.length >= 150) return this.finish(); // keep inside Whisper's 30 s window
  }
  merge() { const n = this.seg.reduce((a, b) => a + b.length, 0); const out = new Float32Array(n); let o = 0; for (const b of this.seg) { out.set(b, o); o += b.length; } return out; }
  interim() { const id = this.seq; this.pending = true; this.tx(this.merge(), this.lang).then((t) => { if (t && id === this.seq && this.speech) this.onInterim(this.label, t); }).catch(() => {}).finally(() => (this.pending = false)); }
  finish() {
    const audio = this.merge(), voiced = this.voiced; this.speech = false; this.seg = []; this.quiet = 0; this.voiced = 0; const id = this.seq;
    if (voiced < 4) return this.onInterim(this.label, ''); // < 0.4 s of voice: ignore clicks and breaths
    this.tx(audio, this.lang).then((r) => { const t = r && r.text; if (r && r.ms) this.onPerf?.({ stt: r.ms, audioMs: Math.round(audio.length / 16) }); if (t) this.onLine(this.label, t); else if (id === this.seq) this.onInterim(this.label, ''); }).catch((e) => this.onInterim(this.label, '⚠ ' + e.message));
  }
  stop() { try { this.node?.disconnect(); this.ctx?.close(); } catch {} this.stream?.getTracks().forEach((t) => t.stop()); }
}

(async () => { const s = await cue.settings.get(); applyTheme(s.theme || 'dark'); })();
