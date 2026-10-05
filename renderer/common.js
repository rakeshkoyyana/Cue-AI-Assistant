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
function popMenu(anchor, html, onMount) {
  $$('.menu').forEach((x) => x.remove());
  const m = document.createElement('div'); m.className = 'menu'; m.innerHTML = html; document.body.appendChild(m);
  const r = anchor.getBoundingClientRect(); m.style.top = r.bottom + 6 + 'px'; m.style.left = Math.max(8, Math.min(innerWidth - 258, r.right - 250)) + 'px';
  const off = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } };
  setTimeout(() => document.addEventListener('mousedown', off, true));
  onMount(m, () => { m.remove(); document.removeEventListener('mousedown', off, true); });
}

const LANGS = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', hi: 'Hindi', pt: 'Portuguese', it: 'Italian', nl: 'Dutch', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian' };
const MODELS = [
  { id: 'anthropic:claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'anthropic:claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'anthropic:claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
  { id: 'ollama:local', label: 'Local model (Ollama)' },
];

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

(async () => { const s = await cue.settings.get(); applyTheme(s.theme || 'light'); })();
