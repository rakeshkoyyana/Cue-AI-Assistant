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
const modelList = (S = {}) => [{ id: 'ollama:local', label: 'Local AI (free)' }].concat(S.anthropicKey ? [
  { id: 'anthropic:claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (cloud)' }, { id: 'anthropic:claude-opus-5-5', label: 'Claude Opus 5.5 (cloud)' }, { id: 'anthropic:claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (cloud)' }] : []);
const brandHTML = () => `${mark(BRAND.mark, 22)}<span>${BRAND.name}</span>${BRAND.suffix ? `<span class="ai">${BRAND.suffix}</span>` : ''}`;

// Live transcription over Deepgram's streaming API. One Channel per audio source.
class Channel {
  constructor(label, onLine, onInterim, lang, key) { Object.assign(this, { label, onLine, onInterim, lang, key }); }
  async start(stream) {
    const url = `wss://api.deepgram.com/v1/listen?model=nova-2&language=${encodeURIComponent(this.lang)}&smart_format=true&interim_results=true&endpointing=500`;
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
let progressSink = null; // shared with the live overlay
cue.setup.onProgress((p) => progressSink && progressSink(p));
const MODEL_CATALOG = [ // all run on Ollama; vision = can read screenshots directly
  { name: 'qwen3.5:4b', label: 'Qwen 3.5 · 4B', note: '~3.3 GB · light and quick · fine on 8 GB RAM', min: 6 },
  { name: 'qwen3.5:9b', label: 'Qwen 3.5 · 9B', note: '~7 GB · fast and sharp, the "flash-lite" tier · 12 GB+', min: 12 },
  { name: 'gemma4:12b', label: 'Gemma 4 · 12B', note: '~8 GB · natural speaking tone, reads screenshots · 12 GB+', min: 12 },
  { name: 'gpt-oss:20b', label: 'GPT-OSS · 20B', note: '~14 GB · strongest reasoning that fits 16 GB RAM', min: 16 },
  { name: 'gemma4:26b', label: 'Gemma 4 · 26B MoE', note: '~17 GB · near-frontier yet fast (4B active) · 24 GB+', min: 24 },
];
const recommendedModel = (ram) => (ram >= 24 ? 'gemma4:26b' : ram >= 12 ? 'qwen3.5:9b' : 'qwen3.5:4b');
async function setupPanel(host, lang, onChange = () => {}) {
  const st = await cue.setup.status(lang); const o = st.ollama;
  const rec = recommendedModel(st.ramGB); const MODEL_CHOICES = MODEL_CATALOG.filter((m) => m.min <= st.ramGB + 2 || m.name === rec);
  const dg = st.cloud.sttEngine === 'deepgram' && st.cloud.deepgram;
  const ollamaRow = !o.ok
    ? `<div class="chk warn"><div class="st">${ic('circle-alert', 16)}</div><div class="grow"><div class="t">Local AI engine · Ollama</div><div class="s">Not detected. Install Ollama (free), open it once, then re-check. Everything stays on your computer.</div><div class="acts"><button class="btn sm" data-a="getollama">${ic('external-link', 14)}Get Ollama</button><button class="btn ghost sm" data-a="recheck">${ic('refresh-cw', 14)}Re-check</button></div></div></div>`
    : !o.ready
      ? `<div class="chk warn"><div class="st">${ic('download', 16)}</div><div class="grow"><div class="t">AI model</div><div class="s">Ollama is running. Download a model to start (one time).</div><div class="acts">${MODEL_CHOICES.map((m) => `<button class="btn sm ${m.name === rec ? 'primary' : 'ghost'}" data-pull="${m.name}" title="${m.note}">${m.label}${m.name === rec ? ' · recommended' : ''}</button>`).join('')}</div><div class="s" style="margin-top:8px">Your computer has ~${st.ramGB} GB RAM. ${MODEL_CATALOG.find((m) => m.name === rec).note}</div><div class="bar" id="ob" style="display:none"><i></i></div></div></div>`
      : `<div class="chk ok"><div class="st">${ic('check', 16)}</div><div class="grow"><div class="t">AI model ready</div><div class="s">${esc(o.model)} · ${o.vision ? 'reads screenshots directly' : 'screenshots are read with built-in OCR'}</div><div class="acts"><select id="mdl" style="width:auto;height:30px;font-size:12.5px">${o.models.map((m) => `<option ${m === o.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select><button class="btn ghost sm" data-a="more">${ic('plus', 14)}Get another model</button></div><div class="bar" id="ob" style="display:none"><i></i></div></div></div>`;
  const sttRow = dg ? `<div class="chk ok"><div class="st">${ic('cloud', 16)}</div><div class="grow"><div class="t">Speech recognition · Deepgram (cloud)</div><div class="s">Using your Deepgram key. Switch back to the free local engine in Settings.</div></div></div>`
    : st.stt.ready ? `<div class="chk ok"><div class="st">${ic('check', 16)}</div><div class="grow"><div class="t">Speech recognition ready</div><div class="s">Whisper runs on your CPU — audio never leaves this computer.</div></div></div>`
      : `<div class="chk warn"><div class="st">${ic('audio-lines', 16)}</div><div class="grow"><div class="t">Speech model · Whisper</div><div class="s">One-time download (~40 MB) so Cue can transcribe the call on your computer.</div><div class="acts"><button class="btn sm primary" data-a="stt">${ic('download', 14)}Download</button></div><div class="bar" id="sb" style="display:none"><i></i></div></div></div>`;
  host.innerHTML = ollamaRow + sttRow;
  const bar = (id, pct) => { const b = $(id, host); if (b) { b.style.display = 'block'; b.firstChild.style.width = (pct ?? 5) + '%'; } };
  const busy = (b, on) => host.querySelectorAll('button').forEach((x) => (x.disabled = on));
  host.onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.a === 'getollama') cue.setup.open('https://ollama.com/download');
    if (t.dataset.a === 'recheck') { await setupPanel(host, lang, onChange); onChange(); }
    if (t.dataset.a === 'more') { host.insertAdjacentHTML('beforeend', `<div class="chk"><div class="st">${ic('plus', 16)}</div><div class="grow"><div class="t">Download another model</div><div class="acts">${MODEL_CHOICES.map((m) => `<button class="btn ghost sm" data-pull="${m.name}" title="${m.note}">${m.label}</button>`).join('')}</div></div></div>`); t.remove(); }
    if (t.dataset.pull) {
      busy(t, true); progressSink = (p) => p.kind === 'ollama' && bar('#ob', p.pct); bar('#ob', 3);
      try { await cue.setup.pullModel(t.dataset.pull); await cue.settings.set({ ollamaModel: t.dataset.pull }); toast('Model ready'); } catch (err) { toast(err.message, 6000); }
      progressSink = null; await setupPanel(host, lang, onChange); onChange();
    }
    if (t.dataset.a === 'stt') {
      busy(t, true); progressSink = (p) => p.kind === 'stt' && bar('#sb', p.pct); bar('#sb', 3);
      try { await cue.setup.initStt(lang); toast('Speech model ready'); } catch (err) { toast('Download failed: ' + err.message + ' — check your internet connection.', 7000); }
      progressSink = null; await setupPanel(host, lang, onChange); onChange();
    }
  };
  const sel = $('#mdl', host); if (sel) sel.onchange = async () => { await cue.settings.set({ ollamaModel: sel.value }); toast('Using ' + sel.value, 1500); };
  return st;
}


// Free live transcription: runs Whisper locally (main process) on speech segments cut by a simple voice-activity detector.
// Shows interim text every ~1.6 s while someone talks, and a final line after ~0.7 s of silence.
class LocalChannel {
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
