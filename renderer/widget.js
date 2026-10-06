if (MODE === 'widget') (() => {
  let S = {};            // global settings
  let sortMode = 'new';  // status | new | old | az | za
  let search = '';
  let liveCleanup = null;
  const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';
  const view = (html) => { app.innerHTML = html; app.firstElementChild?.classList.add('view'); };

  cue.settings.get().then((s) => { S = s; applyTheme(s.theme || 'dark'); });

  // ---------- Hide: shrink the whole widget to a small floating logo. Click to restore, drag to move. ----------
  const bub = document.createElement('div'); bub.id = 'bub';
  bub.innerHTML = `<button id="bubLogo" title="Show ${BRAND.name}" aria-label="Show ${BRAND.name}">${mark(BRAND.mark, 40)}</button>`;
  document.body.appendChild(bub);
  function hide() { document.body.classList.add('bubble'); cue.win.bubble(true); }
  function restore() { document.body.classList.remove('bubble'); cue.win.bubble(false); }
  (() => {
    const el = $('#bubLogo'); let d = null;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); d = { x: e.screenX, y: e.screenY, moved: false }; });
    el.addEventListener('pointermove', (e) => { if (!d) return; const dx = e.screenX - d.x, dy = e.screenY - d.y; if (!d.moved && Math.hypot(dx, dy) < 4) return; d.moved = true; d.x = e.screenX; d.y = e.screenY; cue.win.moveBy(dx, dy); });
    el.addEventListener('pointerup', () => { if (d && !d.moved) restore(); d = null; });
  })();

  // ---------- create / edit wizard (controller lives in wizard.js) ----------
  const wizard = createWizard({ view: (h) => view(h), shell: (h) => shell(h), bindHeader: () => bindHeader(), size: (w, h) => cue.win.size(w, h), cancel: () => viewList(), done: (msg) => { toast(msg); viewList(); } });
  const viewWizard = (session) => wizard.open({ session });
  cue.onGotoLive((sid) => (sid === '__new' ? viewWizard() : viewConnect(sid)));

  // ---------------- shell + rail ----------------
  // The left rail is borderless: Close, Options, Move, Shrink, and Infinity (show on every workspace/desktop).
  const railHTML = () => `<nav class="rail" aria-label="Window controls">
    <button class="rb close" id="rClose" title="Close ${BRAND.name}" aria-label="Close">${ic('x', 16)}</button>
    <button class="rb" id="rOpts" title="Options" aria-label="Options" aria-haspopup="true">${ic('layout-grid', 16)}</button>
    <button class="rb" id="rMove" title="Move (${MOD} + ⇧ + ✥)" aria-label="Move">${ic('move', 16)}</button>
    <button class="rb" id="rShrink" title="Shrink to a floating logo" aria-label="Shrink">${ic('minimize-2', 16)}</button>
    <button class="rb ${S.allWorkspaces === false ? '' : 'on'}" id="rAll" title="Show on all workspaces" aria-label="Show on all workspaces" aria-pressed="${S.allWorkspaces !== false}">${ic('infinity', 16)}</button></nav>`;
  const shell = (inner, cls = '') => `<div class="shell ${cls}">${railHTML()}<div class="smain"><div class="hdr"><div class="brand">${brandHTML()}</div><span class="tier" title="Cloud engines"><i></i>Cloud</span></div>${inner}</div></div>`;
  // ctx.live: in the live overlay "Session Logout" ends the session; elsewhere it quits the app.
  function bindRail(ctx = {}) {
    $('#rClose').onclick = () => cue.win.close();
    $('#rOpts').onclick = (e) => optionsGrid(e.currentTarget, ctx);
    $('#rMove').onclick = (e) => zonePicker(e.currentTarget);
    $('#rShrink').onclick = hide;
    $('#rAll').onclick = async () => { const on = await cue.win.workspaces(S.allWorkspaces === false); S.allWorkspaces = on; const b = $('#rAll'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); toast(on ? 'Showing on all workspaces' : 'Pinned to this workspace', 1400); };
  }
  const bindHeader = () => bindRail({});
  // Move: pick one of 6 screen positions (also ⌘/Ctrl + ⇧ + arrow keys)
  async function zonePicker(anchor) {
    const cur = await cue.win.zone();
    popMenu(anchor, `<div class="it mute">Move to · or ${MOD} ⇧ + arrow keys</div><div class="zgrid">${[0, 1, 2, 3, 4, 5].map((z) => `<button class="zc ${z === cur ? 'on' : ''}" data-z="${z}" title="${['Top left', 'Top center', 'Top right', 'Bottom left', 'Bottom center', 'Bottom right'][z]}"><i></i></button>`).join('')}</div>`, (m, close) => {
      m.onclick = (e) => { const b = e.target.closest('[data-z]'); if (!b) return; cue.win.zone(Number(b.dataset.z)); close(); };
    });
  }
  // Options: a 3x2 grid of keys. (There is deliberately no screen-capture-hiding toggle; Settings takes that slot.)
  const THEME_NEXT = { dark: 'light', light: 'system', system: 'dark' };
  function optionsGrid(anchor, ctx = {}) {
    const th = S.theme || 'dark', icon = th === 'light' ? 'sun' : th === 'dark' ? 'moon' : 'monitor';
    const tile = (k, i, t, sub, extra = '') => `<div class="otile" role="button" tabindex="0" data-k="${k}"><span class="oi">${ic(i, 18)}</span><b>${t}</b><small>${sub}</small>${extra}</div>`;
    const html = `<div class="it mute">Options</div><div class="ogrid">${tile('dash', 'layout-grid', 'Dashboard View', 'Open the dashboard')}${tile('screen', 'monitor', 'Screen Sequence Advance', 'Move to the next screen')}${tile('settings', 'settings', 'Settings', 'Keys &amp; engines')}
      ${tile('zoom', 'search', 'Zoom Adjuster Stepper', 'Interface size', `<span class="step3"><span class="rnd" data-z="-1" role="button" aria-label="Zoom out">−</span><span class="rnd" data-z="0" role="button" aria-label="Reset zoom">${ic('rotate-ccw', 13)}</span><span class="rnd" data-z="1" role="button" aria-label="Zoom in">${ic('plus', 13)}</span></span>`)}
      ${tile('theme', icon, 'Theme Presentation Mode', th[0].toUpperCase() + th.slice(1))}${tile('logout', 'log-out', 'Session Logout', ctx.live ? 'End this session' : 'Quit ' + BRAND.name)}</div>`;
    const release = ctx.grow ? ctx.grow() : null;
    popMenu(anchor, html, (m, close) => {
      m.classList.add('wide'); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, anchor.getBoundingClientRect().left)) + 'px'; if (ctx.live) m.style.top = Math.max(8, anchor.getBoundingClientRect().top) + 'px';
      if (release) { const t = setInterval(() => { if (!m.isConnected) { clearInterval(t); release(); } }, 250); }
      const act = async (e) => {
        const z = e.target.closest('[data-z]'); if (z && z.closest('.ogrid')) { e.stopPropagation(); const d = Number(z.dataset.z); cue.win.zoom(d * 0.1); return; }
        const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
        if (k === 'theme') { S.theme = THEME_NEXT[S.theme || 'dark']; applyTheme(S.theme); await cue.settings.set({ theme: S.theme }); close(); return optionsGrid(anchor, ctx); }
        close();
        if (k === 'dash') cue.win.openDashboard('sessions'); if (k === 'screen') cue.win.nextScreen();
        if (k === 'settings') ctx.live ? cue.win.openDashboard('settings') : viewSettings();
        if (k === 'logout') ctx.live && ctx.end ? ctx.end() : cue.win.close();
      };
      m.onclick = act; m.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } };
    });
  }

  // ---------------- session list ----------------
  async function viewList() {
    cue.win.liveHotkeys(false); cue.win.size(460, 720);
    let list = await cue.sessions.list();
    const kindPill = (s) => (s.type === 'regular' ? `${ic('phone', 12)}Regular` : s.type === 'mock' ? `${ic('mic', 12)}Mock` : `${ic('briefcase-business', 12)}Interview`);
    const draw = () => {
      const q = search.toLowerCase();
      let rows = list.filter((s) => !q || [s.company, s.role, s.title, s.description].join(' ').toLowerCase().includes(q));
      rows = sortSessions(rows, sortMode);
      $('#cards').innerHTML = rows.length ? rows.map((s) => {
        const regular = s.type === 'regular'; const ended = s.status === 'ended';
        return `<div class="scard"><div class="date">${fmtDate(s.createdAt)}</div><div class="co">${esc(clean(regular ? s.title || 'Call' : s.company || s.title || 'Interview'))}</div><div class="rl">${esc(clean(regular ? s.description : s.role)) || '&nbsp;'}</div>
          <button class="dots" data-menu="${s.id}" title="Edit, delete or sort" aria-label="Session options" aria-haspopup="true">${ic('ellipsis-vertical', 15)}</button>
          <div class="tags"><span class="pill">${kindPill(s)}</span>${s.saveTranscript ? `<span class="pill">${ic('file-text', 12)}Transcript</span>` : ''}</div>
          <div class="foot"><div class="grow"><div class="stat"><i class="${ended ? 'end' : ''}"></i>${ended ? 'Ended' : 'Ready to start'}</div><div class="mute" style="font-size:12px">${s.usageMs ? 'Used ' + fmtDur(s.usageMs) : 'No usage yet'}</div></div>
          ${ended ? `<button class="btn ghost sm" data-tr="${s.id}">View Transcript</button>` : ''}<button class="btn sm ${ended ? '' : 'primary'}" data-start="${s.id}">${ic('play', 13)}${ended ? 'Restart' : 'Start Session'}</button></div></div>`;
      }).join('') : `<div class="empty">${ic('sparkles', 28)}<b style="color:var(--text)">No sessions yet</b><span>Create one to get interview or meeting help in real time.</span></div>`;
    };
    view(shell(`<div class="body"><div class="search"><div class="sbox">${ic('search', 15)}<input id="q" placeholder="Search by title or description" value="${esc(search)}" /></div><button class="ib boxed" id="sort" title="Sort" style="width:38px;height:38px">${ic('arrow-up-down', 16)}</button></div><div class="cards" id="cards"></div>
      <div class="footbar"><button class="btn ghost" id="toDash">View in Dashboard${ic('arrow-up-right', 15)}</button><button class="btn primary" id="create">${ic('plus', 16)}Create Session</button></div></div>`));
    bindHeader(); draw();
    $('#q').oninput = (e) => { search = e.target.value; draw(); };
    $('#sort').onclick = (e) => sortMenu(e.currentTarget, sortMode, (v) => { sortMode = v; draw(); });
    $('#toDash').onclick = () => cue.win.openDashboard('sessions');
    $('#create').onclick = () => viewWizard();
    const cardMenu = (anchor, id) => popMenu(anchor, `<div class="it" data-a="edit">${ic('pencil', 15)}<span class="grow">Edit</span></div><div class="it" data-a="del">${ic('trash-2', 15)}<span class="grow">Delete</span></div><div class="sep"></div><div class="it mute">Sort by</div>${SORTS.map(([v, l]) => `<div class="it" data-s="${v}"><span class="grow">${l}</span>${v === sortMode ? ic('check', 15) : ''}</div>`).join('')}`, (m, close) => {
      m.onclick = async (e) => { const it = e.target.closest('.it'); if (!it) return; close();
        if (it.dataset.s) { sortMode = it.dataset.s; draw(); }
        if (it.dataset.a === 'edit') viewWizard(list.find((x) => x.id === id) && await cue.sessions.get(id));
        if (it.dataset.a === 'del' && confirm('Delete this session?')) { await cue.sessions.remove(id); list = list.filter((x) => x.id !== id); draw(); } };
    });
    $('#cards').onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.start) viewConnect(t.dataset.start);
      if (t.dataset.tr) cue.win.openDashboard('sessions');
      if (t.dataset.menu) cardMenu(t, t.dataset.menu);
    };
  }

  // ---------------- connect ----------------
  const GUIDE = `<b style="font-size:16px">Setup guide</b><ol class="guide"><li><b>Pick your audio.</b> ${BRAND.name} listens to your microphone, plus your computer's audio when it can, so it hears the other side.</li>
    <li><b>Windows:</b> allow screen sharing when asked and tick “share system audio”.</li><li><b>macOS:</b> install a loopback device such as BlackHole and select it as the output, then allow Screen Recording for ${BRAND.name} in System Settings.</li>
    <li><b>Test first.</b> Start a mock session and say a sentence — the caption bar should show your words.</li><li><b>Keys.</b> Add your answer and caption keys under Settings. They stay encrypted on this computer.</li></ol><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-x>Got it</button></div>`;
  async function viewConnect(sid) {
    cue.win.size(560, 700);
    const s = await cue.sessions.get(sid); if (!s) return viewList();
    const name = esc(clean(s.type === 'regular' ? s.title || 'Call' : s.company || s.title || 'Interview'));
    view(shell(`<div class="body"><div class="connect"><h2>Connect Call Session</h2>
      <div class="sumcard">${ic('infinity', 20)}<div><b>This is an unlimited session</b><p>${name} runs until you end it. Time on the call is tracked only on this computer, and your transcript is saved there only if you chose Save Transcript.</p></div></div>
      <a href="#" class="tutlink" id="tut" role="button">${ic('circle-play', 18)}<span class="grow"><b>Video Tutorial</b><small>See how to set up audio for a call</small></span>${ic('arrow-up-right', 15)}</a>
      <div id="chk"></div>
      <div class="wcard" role="note">${ic('headphones', 18)}<div><b>Desktop app required for the other side's audio</b><p>To hear the other side of the call, ${BRAND.name} captures your computer's audio, which needs permission from your operating system and, on macOS, a loopback device such as BlackHole. Without it ${BRAND.name} only hears your microphone. Test in a safe environment before the real call.</p></div></div>
      <div class="row" style="margin-top:6px"><button class="btn ghost grow" id="back">Back</button><button class="btn primary grow" id="go">${ic('power', 15)}Connect</button></div></div></div>`)); bindHeader();
    setupPanel($('#chk'), s.language);
    $('#tut').onclick = (e) => { e.preventDefault(); modal(GUIDE, (b, close) => ($('[data-x]', b).onclick = close)); };
    $('#back').onclick = viewList; $('#go').onclick = () => viewLive(sid);
  }

  // ---------------- live overlay ----------------
  async function viewLive(sid) {
    const s = await cue.sessions.get(sid); if (!s) return viewList();
    S = await cue.settings.get();
    const lines = []; const interim = {}; const answers = []; let idx = -1; let current = null; let chatMode = false; let pendingQ = []; let autoTimer = null;
    const channels = []; const t0 = Date.now(); const perf = { stt: null };
    cue.win.size(940, 236); cue.win.liveHotkeys(true);
    await cue.sessions.update(sid, { status: 'live' });
    $('#bubLogo').classList.add('run');

    const LH = 236, PH = 580; // window heights: HUD + caption bar only / with the answer panel open
    view(`<div class="live-root">${railHTML()}<div class="lcol"><div class="hud glass" role="toolbar" aria-label="Answer HUD">
      <div class="hsearch">${ic('search', 14)}<input id="hSearch" placeholder="Search answers" aria-label="Search answers" autocomplete="off" /></div>
      <span class="hstat" id="hStat" role="status" data-s="ready"><i></i><span>Ready</span></span>
      <div class="hpage"><button class="nb" id="hPrev" title="Previous answer (${MOD}←)" aria-label="Previous answer">${ic('chevron-left', 14)}</button><span class="cnt" id="hCnt" aria-live="polite">0 of 0</span><button class="nb" id="hNext" title="Next answer (${MOD}→)" aria-label="Next answer">${ic('chevron-right', 14)}</button></div>
      <button class="lbtn sq" id="hType" title="Type a question (${MOD}⇧␣)" aria-label="Type a question">${ic('pen-line', 16)}</button>
      <label class="hop" title="Window opacity">${ic('eye', 14)}<input type="range" id="op" min="40" max="100" value="100" aria-label="Opacity" /></label>
      <button class="lbtn sq" id="hAux" title="More" aria-label="More options" aria-haspopup="true">${ic('chevron-down', 16)}</button></div>
      <div class="lbar glass"><div class="dev"><span id="dMic" title="Microphone">${ic('mic', 15)}</span><span id="dSys" title="System audio">${ic('volume-2', 15)}</span></div>
      <button class="lbtn primary" id="bAns">${ic('sparkles', 15)}Answer<kbd>${MOD}↵</kbd></button><button class="lbtn" id="bShot">${ic('camera', 15)}Screenshot<kbd>${MOD}⇧↵</kbd></button><button class="lbtn" id="bChat">${ic('message-square-text', 15)}Chat<kbd>${MOD}⇧␣</kbd></button>
      ${s.type === 'mock' ? `<button class="lbtn" id="bNext">${ic('mic', 15)}Next question</button>` : ''}<div class="grow"></div>
      <button class="timer" id="timer" title="End session">0:00</button></div>
      <div class="lstat glass"><div class="wave idle" id="wave"><i></i><i></i><i></i><i></i></div><div class="txt" id="ltxt">Connecting…</div><button class="lbtn" id="bClearTx">${ic('eraser', 15)}Clear<kbd>${MOD}⇧⌫</kbd></button></div>
      <div class="apanel glass" id="panel" style="display:none"></div></div></div>`);

    const setStatus = (t) => ($('#ltxt').textContent = t);
    const refreshLine = () => {
      if (chatMode) return; const el = $('#ltxt');
      const cur = Object.entries(interim).filter(([, t]) => t).pop(); const last = lines[lines.length - 1];
      const who = cur ? cur[0] : last?.speaker; const text = cur ? cur[1] : last?.text;
      el.innerHTML = text ? `<b>${esc(who)}</b>${esc(text)}` : 'Listening…';
    };
    const persist = () => s.saveTranscript && cue.sessions.update(sid, { transcript: lines });
    const isThem = (w) => w !== 'You';
    const onLine = (who, text) => {
      delete interim[who]; lines.push({ speaker: who, text, t: Date.now() }); persist(); refreshLine();
      if (isThem(who)) {
        pendingQ.push(text); pendingQ = pendingQ.slice(-3);
        if (s.autoGenerate) { clearTimeout(autoTimer); autoTimer = setTimeout(() => { const q = pendingQ.join(' '); if (!current && /\?|^(what|how|why|can|could|would|tell|explain|describe|walk|do|did|is|are|when|where|which)\b/i.test(q.trim())) ask({ kind: 'Auto' }); }, 1300); }
      }
    };
    const onInterim = (who, text) => { interim[who] = text; refreshLine(); };

    // --- audio: free local Whisper by default; Deepgram only if the user chose it and added a key ---
    const key = await cue.deepgramKey(); // Deepgram = live word-by-word captions; otherwise Groq Whisper per sentence
    const makeChannel = (label) => (key ? new Channel(label, onLine, onInterim, s.language, key) : new SegmentChannel(label, onLine, onInterim, s.language));
    (async () => {
      try {
        if (!key && !S.groqKey) throw new Error('add a Deepgram key (live captions) in Settings (⋮ menu)');
        const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const c1 = makeChannel('You'); c1.onPerf = (p) => (perf.stt = p.stt); await c1.start(m); channels.push(c1); $('#dMic')?.classList.add('on');
        try {
          const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); d.getVideoTracks().forEach((t) => t.stop());
          if (d.getAudioTracks().length) { const c2 = makeChannel(s.type === 'regular' ? 'Participant' : 'Interviewer'); c2.onPerf = (p) => (perf.stt = p.stt); await c2.start(d); channels.push(c2); $('#dSys')?.classList.add('on'); }
          else toast('No system audio captured — listening to your mic only', 5000);
        } catch { toast('System audio unavailable — listening to your mic only (macOS needs BlackHole)', 6000); }
        refreshLine();
      } catch (e) { setStatus('Transcription unavailable: ' + e.message + ' — Chat and Screenshot still work.'); }
    })();
    const lvl = setInterval(() => { const on = channels.some((c) => (c.level ?? 1) > 0.015); $('#wave')?.classList.toggle('idle', !on); }, 200);
    const timer = setInterval(() => { const sec = Math.floor((Date.now() - t0) / 1000); const el = $('#timer'); if (el) el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }, 1000);

    // --- answer panel ---
    function renderPanel() {
      const p = $('#panel');
      const vis = visible(); if (idx >= 0 && filter && !vis.includes(idx) && vis.length) idx = vis[0];
      if (idx < 0) { p.style.display = 'none'; cue.win.size(940, LH); return hudPaint(); }
      if (p.style.display === 'none') { p.style.display = 'flex'; cue.win.size(940, PH); }
      if (filter && !vis.length) { p.innerHTML = `<div class="nav"><div class="grow"></div><button class="lbtn" id="pClear">${ic('eraser', 14)}Clear<kbd>${MOD}⌫</kbd></button></div><div class="empty">${ic('search', 24)}<span>No answers match “${esc($('#hSearch').value)}”.</span></div>`; $('#pClear').onclick = clearAnswers; return hudPaint(); }
      const a = answers[idx];
      const live = current && current.a === a;
      p.innerHTML = `<div class="nav"><div class="grow"></div><button class="lbtn sq" id="pCopy" title="Copy answer">${ic('copy', 15)}</button><button class="lbtn" id="pClear">${ic('eraser', 14)}Clear<kbd>${MOD}⌫</kbd></button></div>
        <div class="acard"><div class="q">${ic('message-square-text', 15)}<span>${esc(a.q)}</span></div><div class="a ${live ? 'live' : ''}">${md(a.a || '…')}</div><div class="meta">${esc(a.kind)} · ${new Date(a.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${a.stats ? `${a.stats.model ? ' · ' + esc(a.stats.model.split(':').slice(1).join(':')) : ''} · first word ${a.stats.ttft != null ? (a.stats.ttft / 1000).toFixed(1) + 's' : '—'}${a.stats.tps ? ` · ${a.stats.tps} tok/s` : ''}${a.stats.promptTokens ? ` · ${a.stats.promptTokens} prompt tokens` : ''}` : ''}${a.sttMs ? ` · speech→text ${(a.sttMs / 1000).toFixed(1)}s` : ''}</div></div>`;
      $('#pCopy').onclick = () => { navigator.clipboard.writeText(a.a); toast('Copied', 1200); };
      $('#pClear').onclick = clearAnswers; hudPaint();
    }
    // HUD: search filters the answers; the pager steps through the matches; the status pill follows the current answer.
    let filter = '';
    const visible = () => answers.map((_a, i) => i).filter((i) => !filter || `${answers[i].q} ${answers[i].a}`.toLowerCase().includes(filter));
    function hudPaint() {
      const vis = visible(), pos = vis.indexOf(idx), st = current ? 'answering' : answers.length ? 'answered' : 'ready';
      const c = $('#hCnt'); if (c) c.textContent = vis.length ? `${pos < 0 ? 1 : pos + 1} of ${vis.length}` : '0 of 0';
      const h = $('#hStat'); if (h) { h.dataset.s = st; h.lastElementChild.textContent = { answering: 'Answering…', answered: 'Answered', ready: 'Ready' }[st]; }
      ['#hPrev', '#hNext'].forEach((q) => { const b = $(q); if (b) b.disabled = vis.length < 2; });
    }
    const nav = (d) => { const vis = visible(); if (!vis.length) return; const pos = vis.indexOf(idx); idx = vis[(pos + d + vis.length) % vis.length]; renderPanel(); };
    function clearAnswers() { answers.length = 0; idx = -1; filter = ''; $('#hSearch').value = ''; renderPanel(); }

    const early = {}; // events that arrive before ask() has returned its request id
    const onChunk = ({ reqId, text }) => { if (!current || current.reqId !== reqId) { (early[reqId] ||= []).push(['c', { reqId, text }]); return; } current.a.a += text; if (answers[idx] === current.a) { const el = $('.acard .a'); if (el) el.innerHTML = md(current.a.a); } };
    const onDone = ({ reqId, ok, error, stats }) => { if (!current || current.reqId !== reqId) { (early[reqId] ||= []).push(['d', { reqId, ok, error, stats }]); return; } current.a.stats = stats || null; if (!ok) current.a.a += (current.a.a ? '\n\n' : '') + '⚠ ' + error; current = null; renderPanel(); };
    cue.llm.onChunk(onChunk); cue.llm.onDone(onDone);

    async function ask({ kind = 'Answer', image = null, typed = '' } = {}) {
      if (current) return toast('Still answering — wait a moment', 1500);
      const lastQ = pendingQ.join(' ').trim();
      const q = typed || (image ? 'Screenshot analysis' : lastQ || 'Latest part of the conversation');
      const question = typed || (image ? '' : lastQ ? `Answer this question that was just asked in the conversation: ${lastQ}` : '');
      const a = { kind, q, a: '', t: Date.now(), sttMs: perf.stt }; filter = ''; $('#hSearch').value = ''; answers.push(a); idx = answers.length - 1; renderPanel();
      try {
        const reqId = await cue.llm.ask({ sessionId: sid, question, image, transcript: lines }); current = { reqId, a };
        pendingQ = []; renderPanel();
        for (const [k, d] of early[reqId] || []) (k === 'c' ? onChunk : onDone)(d); delete early[reqId];
      } catch (e) { a.a = '⚠ ' + e.message; renderPanel(); }
    }
    const shot = async () => { const img = await cue.capture.screenshot(); if (img) ask({ kind: 'Screenshot', image: img }); else toast('Screenshot failed'); };
    const openChat = () => {
      chatMode = true; $('#ltxt').outerHTML = `<input class="txt" id="chatIn" placeholder="Ask anything… (Enter to send, Esc to cancel)" style="flex:1">`; const el = $('#chatIn'); el.focus();
      const done = () => { chatMode = false; el.outerHTML = `<div class="txt" id="ltxt"></div>`; refreshLine(); };
      el.onkeydown = (e) => { if (e.key === 'Enter' && el.value.trim()) { const v = el.value.trim(); done(); ask({ kind: 'Chat', typed: v }); } if (e.key === 'Escape') done(); };
    };
    const clearTx = () => { lines.length = 0; for (const k in interim) delete interim[k]; pendingQ = []; persist(); refreshLine(); };

    $('#bAns').onclick = () => ask({}); $('#bShot').onclick = shot; $('#bChat').onclick = openChat; $('#bClearTx').onclick = clearTx;
    const grow = () => { cue.win.size(940, Math.max(idx >= 0 ? PH : LH, 420)); return () => cue.win.size(940, idx >= 0 ? PH : LH); }; // menus need room: the window is only a strip
    bindRail({ live: true, end: () => end(), grow });
    $('#hSearch').oninput = (e) => { filter = e.target.value.trim().toLowerCase(); if (idx < 0 && answers.length) idx = answers.length - 1; renderPanel(); };
    $('#hPrev').onclick = () => nav(-1); $('#hNext').onclick = () => nav(1); $('#hType').onclick = openChat;
    $('#op').oninput = (ev) => cue.win.opacity(ev.target.value / 100);
    $('#hAux').onclick = (e) => { const release = grow(); popMenu(e.currentTarget, `<div class="it" data-a="sum">${ic('book-open', 15)}<span class="grow">Summarize session</span></div><div class="it" data-a="dash">${ic('layout-grid', 15)}<span class="grow">Dashboard</span>${ic('arrow-up-right', 14)}</div><div class="it" data-a="screen">${ic('monitor', 15)}<span class="grow">Next Screen</span></div><div class="sep"></div><div class="it" data-a="end">${ic('power', 15)}<span class="grow">End session</span></div>`, (m, close) => {
      const t = setInterval(() => { if (!m.isConnected) { clearInterval(t); release(); } }, 250);
      m.onclick = async (ev) => { const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; close();
        if (a === 'dash') cue.win.openDashboard('sessions'); if (a === 'screen') cue.win.nextScreen(); if (a === 'end') end();
        if (a === 'sum') { toast('Summarizing…'); try { textModal('Session summary', await cue.llm.summarize(sid)); } catch (err) { toast(err.message, 5000); } } };
    }); };
    if ($('#bNext')) $('#bNext').onclick = async () => {
      const resume = s.resumeId ? (await cue.docs.preview(s.resumeId)).slice(0, 8000) : '';
      const asked = lines.filter((l) => l.speaker === 'Interviewer').map((l) => l.text).join('\n');
      try {
        const q = (await cue.llm.complete({ system: 'You are a professional interviewer. Ask exactly ONE interview question at a time, tailored to the role. Output only the question.', model: s.model,
          user: `Company: ${s.company}\nRole: ${s.role}\nJob description:\n${s.jobDescription}\n\nCandidate resume:\n${resume}\n\nQuestions already asked:\n${asked || '(none)'}\n\nAsk the next question.` })).trim();
        onLine('Interviewer', q); speechSynthesis.speak(new SpeechSynthesisUtterance(q));
      } catch (e) { toast(e.message, 5000); }
    };
    $('#timer').onclick = () => confirm('End this session?') && end();

    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'ArrowLeft') nav(-1); if (mod && e.key === 'ArrowRight') nav(1); if (mod && !e.shiftKey && e.key === 'Backspace') clearAnswers();
    };
    window.addEventListener('keydown', onKey);
    cue.onHotkey((n) => { if (!liveCleanup) return; if (n === 'answer') ask({}); if (n === 'screenshot') shot(); if (n === 'chat') openChat(); if (n === 'clear') clearTx(); });

    async function end() {
      if (!liveCleanup) return; liveCleanup();
      await cue.sessions.update(sid, { status: 'ended', usageMs: (s.usageMs || 0) + (Date.now() - t0), transcript: s.saveTranscript ? lines : [] });
      if (document.body.classList.contains('bubble')) restore();
      viewList();
    }
    liveCleanup = () => { liveCleanup = null; clearInterval(timer); clearInterval(lvl); clearTimeout(autoTimer); channels.forEach((c) => c.stop()); window.removeEventListener('keydown', onKey); speechSynthesis.cancel(); cue.win.opacity(1); $('#bubLogo')?.classList.remove('run'); };
  }

  // ---------------- settings ----------------
  async function viewSettings() {
    cue.win.size(560, 760); S = await cue.settings.get();
    view(shell(`<div class="body"><h2 style="margin:4px 0 2px;letter-spacing:-.02em">Setup &amp; Settings</h2><p class="mute" style="margin:0 0 14px">Pick your AI engines. Nothing heavy runs on your Mac.</p>
      ${settingsFormHTML(S)}
      <div class="wizfoot"><button class="btn ghost" id="cancel">Back</button><button class="btn primary" id="save">Save</button></div></div>`)); bindHeader();
    const saveForm = bindSettingsForm(app, S);
    $('#cancel').onclick = viewList;
    $('#save').onclick = async () => { S = await saveForm(); toast('Saved'); viewList(); };
  }

  viewList();
})();
