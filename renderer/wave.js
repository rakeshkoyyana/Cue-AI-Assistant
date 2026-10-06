// wave.js — waveform peaks + a recording card (renderer). The recording is read in the browser from a file the user chooses;
// it is never uploaded or stored. computePeaks is pure, so it is tested in plain Node.
(function (root) {
  // channels: array of Float32Array (mono or stereo) -> Float32Array(buckets) of peak amplitude, normalised to 0..1.
  function computePeaks(channels, buckets) {
    const n = channels && channels[0] ? channels[0].length : 0, out = new Float32Array(Math.max(0, buckets | 0));
    if (!n || !out.length) return out;
    const size = n / out.length; let top = 0;
    for (let b = 0; b < out.length; b++) {
      const s = Math.floor(b * size), e = Math.min(n, Math.max(s + 1, Math.floor((b + 1) * size))), step = Math.max(1, Math.floor((e - s) / 64)); // at most ~64 samples per bucket keeps long recordings fast
      let m = 0; for (const ch of channels) for (let i = s; i < e; i += step) { const v = Math.abs(ch[i]); if (v > m) m = v; }
      out[b] = m; if (m > top) top = m;
    }
    if (top > 0) for (let b = 0; b < out.length; b++) out[b] /= top;
    return out;
  }

  const fmtClock = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // Draws bars; the part before `progress` (0..1) is accented. Quietly does nothing where canvas isn't available.
  function drawWave(canvas, peaks, progress = 0) {
    const ctx = canvas.getContext && canvas.getContext('2d'); if (!ctx) return;
    const dpr = root.devicePixelRatio || 1, w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w) canvas.width = w; if (canvas.height !== h) canvas.height = h;
    const css = getComputedStyle(canvas), played = css.getPropertyValue('--accent').trim() || '#7c6cff', rest = css.getPropertyValue('--s4').trim() || '#272c38';
    ctx.clearRect(0, 0, w, h);
    const bars = peaks && peaks.length ? peaks : new Float32Array(0), gap = Math.max(1, Math.round(dpr)), bw = Math.max(1, w / Math.max(1, bars.length) - gap);
    for (let i = 0; i < bars.length; i++) {
      const bh = Math.max(2 * dpr, bars[i] * h * 0.92), x = i * (bw + gap);
      ctx.fillStyle = (i + 0.5) / bars.length <= progress ? played : rest; ctx.fillRect(x, (h - bh) / 2, bw, bh);
    }
  }

  const MAX_DECODE = 60 * 1024 * 1024; // decoding expands to raw PCM, so very large files get playback but no drawn waveform

  // Mounts the "recording" card into `host`. Returns { destroy() } (stops audio, cancels the animation loop, frees the blob URL).
  function mountWaveCard(host, { ic = () => '', esc = (s) => s } = {}) {
    host.innerHTML = `<div class="rec"><div class="rhead"><span class="ricon">${ic('audio-lines', 18)}</span><div class="grow"><b data-n>No recording loaded</b><div class="mute" data-m>Choose an audio or video file from this computer (or drop one here) to see its waveform. It is read locally and never uploaded or saved.</div></div>
      <button class="btn sm" data-pick>${ic('upload', 14)}Choose recording…</button><input type="file" accept="audio/*,video/*" hidden data-file></div>
      <div class="rcanvas"><canvas data-c aria-label="Audio waveform" role="img"></canvas></div><div class="rctl"><button class="ib boxed" data-play disabled aria-label="Play">${ic('play', 15)}</button><span class="mute" data-t>0:00 / 0:00</span></div></div>`;
    const q = (s) => host.querySelector(s), canvas = q('[data-c]'), card = q('.rec');
    let peaks = null, audio = null, url = '', raf = 0, dur = 0;
    const paint = () => drawWave(canvas, peaks, dur ? (audio ? audio.currentTime : 0) / dur : 0);
    const clock = () => { q('[data-t]').textContent = `${fmtClock(audio ? audio.currentTime : 0)} / ${fmtClock(dur)}`; };
    const tick = () => { paint(); clock(); if (audio && !audio.paused) raf = requestAnimationFrame(tick); }; // the live-rendering loop: redraws every frame while playing
    const stop = () => { cancelAnimationFrame(raf); if (audio) { audio.pause(); audio.removeAttribute('src'); } if (url) URL.revokeObjectURL(url); audio = null; url = ''; };
    const say = (m) => (q('[data-m]').textContent = m);

    async function load(file) {
      stop(); peaks = null; dur = 0; q('[data-n]').textContent = file.name; q('[data-n]').title = file.name;
      say(`${(file.size / 1048576).toFixed(1)} MB · reading…`); q('[data-play]').disabled = true;
      if (file.size <= MAX_DECODE) {
        try {
          const Ctx = root.AudioContext || root.webkitAudioContext; if (!Ctx) throw new Error('no audio decoder');
          const ctx = new Ctx(); const buf = await ctx.decodeAudioData(await file.arrayBuffer()); try { ctx.close(); } catch {}
          peaks = computePeaks(Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), 600); dur = buf.duration; say(`${(file.size / 1048576).toFixed(1)} MB · ${fmtClock(dur)}`);
        } catch { say('Could not read audio from this file. Try an mp3, m4a, wav, mp4 or webm recording.'); }
      } else say(`${(file.size / 1048576).toFixed(0)} MB — too large to draw a waveform (limit 60 MB). Playback still works.`);
      url = URL.createObjectURL(file); audio = new Audio(url);
      audio.addEventListener('loadedmetadata', () => { if (!dur && isFinite(audio.duration)) dur = audio.duration; clock(); paint(); });
      audio.addEventListener('play', () => { q('[data-play]').innerHTML = ic('square', 15); q('[data-play]').setAttribute('aria-label', 'Pause'); tick(); });
      const idle = () => { q('[data-play]').innerHTML = ic('play', 15); q('[data-play]').setAttribute('aria-label', 'Play'); tick(); };
      audio.addEventListener('pause', idle); audio.addEventListener('ended', idle);
      q('[data-play]').disabled = false; paint(); clock();
    }

    q('[data-pick]').onclick = () => q('[data-file]').click();
    q('[data-file]').onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) load(f); e.target.value = ''; };
    q('[data-play]').onclick = () => { if (!audio) return; if (audio.paused) audio.play().catch(() => say('Playback failed for this file.')); else audio.pause(); };
    canvas.onclick = (e) => { if (!audio || !dur) return; const r = canvas.getBoundingClientRect(); audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; tick(); };
    card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop'));
    card.addEventListener('drop', (e) => { e.preventDefault(); card.classList.remove('drop'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^(audio|video)\//.test(f.type)) load(f); else if (f) say('That file is not an audio or video recording.'); });
    root.addEventListener && root.addEventListener('resize', paint); paint();
    return { destroy() { stop(); root.removeEventListener && root.removeEventListener('resize', paint); } };
  }

  const API = { computePeaks, drawWave, mountWaveCard, fmtClock };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.WAVE = API;
})(typeof window !== 'undefined' ? window : globalThis);
