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

const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian' };
// Free local AI is always first; cloud models only appear once an API key has been added (optional, future scope).
// Groq models are always available (free tier); Claude appears once an Anthropic key is added.
const GROQ_MODEL_LIST = [
  { id: 'groq:openai/gpt-oss-120b', label: 'GPT-OSS 120B · best answers' }, { id: 'groq:llama-3.3-70b-versatile', label: 'Llama 3.3 70B · natural tone' },
  { id: 'groq:openai/gpt-oss-20b', label: 'GPT-OSS 20B · fastest' }, { id: 'groq:llama-3.1-8b-instant', label: 'Llama 3.1 8B · highest daily limit' }];
const DEFAULT_MODEL = GROQ_MODEL_LIST[0].id;
const modelList = (S = {}) => GROQ_MODEL_LIST.concat(S.anthropicKey ? [
  { id: 'anthropic:claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (paid)' }, { id: 'anthropic:claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (paid)' }] : []);
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
// ---------- engine setup checklist (Connect screen, Settings, dashboard) ----------
async function setupPanel(host, _lang, onChange = () => {}) {
  const st = await cue.setup.status();
  const keyForm = (id, ph, link, linkLabel) => `<div class="row" style="margin-top:9px"><input id="${id}" type="password" placeholder="${ph}" style="height:32px" /><button class="btn sm primary" data-save="${id}" style="flex:none">Save</button></div><div class="acts"><button class="btn ghost sm" data-open="${link}">${ic('external-link', 14)}${linkLabel}</button></div>`;
  const groqRow = !st.groq
    ? `<div class="chk warn"><div class="st">${ic('zap', 16)}</div><div class="grow"><div class="t">Groq · answers + transcription</div><div class="s">Free key, about a minute: sign in at console.groq.com → <b>API Keys</b> → <b>Create API Key</b>, then paste it here.</div>${keyForm('gk', 'gsk_…', 'https://console.groq.com/keys', 'Get a free Groq key')}</div></div>`
    : `<div class="chk" id="groqRow"><div class="st">${ic('loader-circle', 16, 'spin')}</div><div class="grow"><div class="t">Groq</div><div class="s">Checking your key…</div></div></div>`;
  const sttRow = st.sttEngine === 'deepgram'
    ? `<div class="chk" id="dgRow"><div class="st">${ic('loader-circle', 16, 'spin')}</div><div class="grow"><div class="t">Transcription · Deepgram</div><div class="s">Checking your key…</div></div></div>`
    : `<div class="chk ${st.groq ? 'ok' : ''}"><div class="st">${ic(st.groq ? 'check' : 'audio-lines', 16)}</div><div class="grow"><div class="t">Transcription · Groq Whisper</div><div class="s">Uses the same Groq key. Text appears about a second after each sentence. For live word-by-word captions, add a Deepgram key under <b>More engines</b>.</div></div></div>`;
  host.innerHTML = groqRow + sttRow;
  const mark = (row, ok, title, msg) => { if (!row) return; row.className = 'chk ' + (ok ? 'ok' : 'warn'); row.querySelector('.st').innerHTML = ic(ok ? 'check' : 'circle-alert', 16); row.querySelector('.t').textContent = title; row.querySelector('.s').innerHTML = msg; };
  if (st.groq) cue.setup.test('groq').then((r) => mark($('#groqRow', host), r.ok, r.ok ? 'Groq connected' : 'Groq key problem', r.ok ? 'Answers stream from Groq’s free tier — usually starting in about a second.' : `${esc(r.error)} <button class="btn ghost sm" data-a="regroq" style="margin-top:8px">Replace key</button>`));
  if (st.sttEngine === 'deepgram') cue.setup.test('deepgram').then((r) => mark($('#dgRow', host), r.ok, r.ok ? 'Transcription · Deepgram (live captions)' : 'Deepgram key problem', r.ok ? 'Word-by-word live transcription.' : esc(r.error)));
  host.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.open) cue.setup.open(t.dataset.open);
    if (t.dataset.a === 'regroq') { await cue.settings.set({ groqKey: '' }); await setupPanel(host, _lang, onChange); }
    if (t.dataset.save) {
      const v = $('#' + t.dataset.save, host).value.trim(); if (!v) return toast('Paste the key first');
      await cue.settings.set({ groqKey: v }); const r = await cue.setup.test('groq');
      if (!r.ok) { toast(r.error, 6000); await cue.settings.set({ groqKey: '' }); return; }
      toast('Groq connected'); await setupPanel(host, _lang, onChange); onChange();
    }
  };
  return st;
}
// Settings form shared by the widget and the dashboard.
const settingsFormHTML = (S) => `<div id="chk"></div>
  <details class="adv"><summary>${ic('layers', 16)}More engines (optional)${ic('chevron-down', 16)}</summary><div>
    <label class="lbl">Default answer model</label><select id="groqModel">${GROQ_MODEL_LIST.map((m) => `<option value="${m.id.slice(5)}">${m.label}</option>`).join('')}</select>
    <label class="lbl">Transcription engine</label><select id="stt"><option value="groq">Groq Whisper (free, ~1 s after each sentence)</option><option value="deepgram">Deepgram (live word-by-word, $200 free credit)</option></select>
    <label class="lbl">Deepgram API key <small>(console.deepgram.com)</small></label><input id="deepgramKey" type="password" value="${esc(S.deepgramKey)}" />
    <label class="lbl">Anthropic API key <small>(paid, optional)</small></label><input id="anthropicKey" type="password" value="${esc(S.anthropicKey)}" placeholder="sk-ant-…" />
    <p class="mute" style="font-size:12px;margin:10px 0 0">Keys are encrypted with your OS keychain and only sent to that provider.</p></div></details>`;
function bindSettingsForm(root, S) {
  $('#groqModel', root).value = S.groqModel || 'openai/gpt-oss-120b'; $('#stt', root).value = S.stt === 'deepgram' ? 'deepgram' : 'groq';
  setupPanel($('#chk', root));
  return async () => {
    const patch = {}; ['groqModel', 'stt', 'deepgramKey', 'anthropicKey'].forEach((k) => (patch[k] = $('#' + k, root).value));
    if (patch.stt === 'deepgram' && !patch.deepgramKey) { patch.stt = 'groq'; toast('Add a Deepgram key to use Deepgram — keeping Groq Whisper', 4000); }
    return cue.settings.set(patch);
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
