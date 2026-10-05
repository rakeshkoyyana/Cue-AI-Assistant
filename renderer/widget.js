if (MODE === 'widget') (() => {
  let S = {};            // global settings
  let sortMode = 'new';  // new | old | az
  let search = '';
  let liveCleanup = null;

  cue.settings.get().then((s) => (S = s));

  // ---------- Hide: collapse the whole widget into a small floating logo; click it to restore ----------
  const bub = document.createElement('div'); bub.id = 'bub';
  bub.innerHTML = '<button id="bubLogo" title="Show Cue">●</button><button id="bubX" title="Close Cue">✕</button>';
  document.body.appendChild(bub);
  function hide() { document.body.classList.add('bubble'); cue.win.bubble(true); }
  function restore() { document.body.classList.remove('bubble'); cue.win.bubble(false); }
  $('#bubLogo').onclick = restore;
  $('#bubX').onclick = () => { if (!liveCleanup || confirm('A session is running. Close Cue?')) cue.win.close(); };

  // ---------- Resume / document picker (dropdown with Refresh + Upload, opens upward when near the bottom) ----------
  const docNames = {};
  const pickerLabel = (kind) => (kind === 'resume' ? docNames[draft.resumeId] || 'Select a resume…' : draft.docIds.length ? `${draft.docIds.length} selected` : 'Select documents');
  function openPicker(anchor, kind) {
    $$('.menu').forEach((x) => x.remove());
    const multi = kind === 'document';
    const m = document.createElement('div'); m.className = 'menu pick'; document.body.appendChild(m);
    const off = (e) => { if (!m.contains(e.target) && e.target !== anchor) close(); };
    const close = () => { m.remove(); document.removeEventListener('mousedown', off, true); };
    setTimeout(() => document.addEventListener('mousedown', off, true));
    const place = () => {
      const r = anchor.getBoundingClientRect(); m.style.width = Math.max(r.width, 240) + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
      const h = m.offsetHeight; m.style.top = (r.bottom + h + 10 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    };
    const draw = async () => {
      const items = (await cue.docs.list()).filter((d) => d.kind === kind); items.forEach((d) => (docNames[d.id] = d.name));
      const sel = multi ? draft.docIds : [draft.resumeId];
      m.innerHTML = `<div class="plist">${items.map((d) => `<div class="it" data-id="${d.id}">${multi ? `<input type="checkbox" style="width:auto" ${sel.includes(d.id) ? 'checked' : ''}>` : ''}<span class="grow" style="word-break:break-word">${esc(d.name)}</span>${!multi && sel[0] === d.id ? '✓' : ''}</div>`).join('') || `<div class="it mute">No ${multi ? 'documents' : 'resumes'} yet</div>`}</div><div class="sep"></div>
        <div class="it" data-a="refresh">↻ Refresh ${multi ? 'documents' : 'resumes'}</div><div class="it" data-a="upload">＋ Upload a ${multi ? 'document' : 'resume'}</div>`;
      place();
    };
    m.onclick = async (e) => {
      const row = e.target.closest('.it'); if (!row) return;
      if (row.dataset.a === 'refresh') { await draw(); toast('Refreshed', 900); return; }
      if (row.dataset.a === 'upload') {
        const r = await cue.docs.importFiles(kind); r.filter((x) => x.error).forEach((x) => toast(x.error, 5000));
        r.filter((x) => x.id).forEach((x) => { docNames[x.id] = x.name; if (multi) draft.docIds.push(x.id); else draft.resumeId = x.id; });
        anchor.firstChild.textContent = pickerLabel(kind); await draw(); if (!multi && r.some((x) => x.id)) close(); return;
      }
      const id = row.dataset.id; if (!id) return;
      if (multi) { draft.docIds = draft.docIds.includes(id) ? draft.docIds.filter((x) => x !== id) : [...draft.docIds, id]; await draw(); }
      else { draft.resumeId = draft.resumeId === id ? '' : id; close(); }
      anchor.firstChild.textContent = pickerLabel(kind);
    };
    draw();
  }
  cue.onGotoLive((sid) => (sid === '__new' ? viewWizard() : viewConnect(sid)));

  // ---------------- shell + header ----------------
  const shell = (inner, cls = '') => `<div class="shell ${cls}"><div class="hdr"><div class="brand"><span class="logo"></span>Cue</div>
    <button class="ib" title="Self-hosted: unlimited usage">∞</button><button class="ib" id="hCollapse" title="Hide">⤡</button><button class="ib mv" title="Move (⌘ + ⇧ + ✥)  ·  drag me, or use ⌘⇧ + arrow keys during a live session">✥</button><button class="ib" id="hMenu" title="Menu">⋮</button><button class="ib close" id="hClose" title="Close">✕</button></div>${inner}</div>`;
  function bindHeader() {
    $('#hCollapse').onclick = hide;
    $('#hClose').onclick = () => cue.win.close();
    $('#hMenu').onclick = (e) => kebab(e.currentTarget);
  }
  function kebab(anchor) {
    popMenu(anchor, `<div class="it mute">Cue · local & private</div><div class="sep"></div>
      <div class="it" data-a="dash"><span class="grow">Dashboard</span>↗</div>
      <div class="it" data-a="screen"><span class="grow">Next Screen</span>→</div>
      <div class="it" data-a="settings"><span class="grow">Settings</span>⚙</div>
      <div class="it"><span class="grow">Zoom</span><span class="rnd" data-a="zin">+</span><span class="rnd" data-a="zout">−</span><span class="rnd" data-a="zreset">⟳</span></div>
      <div class="it"><span class="grow">Theme</span><span class="rnd ${S.theme === 'light' ? 'on' : ''}" data-a="t-light">☀</span><span class="rnd ${S.theme === 'dark' ? 'on' : ''}" data-a="t-dark">☾</span><span class="rnd ${S.theme === 'system' ? 'on' : ''}" data-a="t-system">◐</span></div>
      <div class="it" data-a="quit"><span class="grow">Quit Cue</span></div>`, (m, close) => {
      m.onclick = async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
        if (a === 'dash') cue.win.openDashboard('sessions');
        if (a === 'screen') cue.win.nextScreen();
        if (a === 'settings') viewSettings();
        if (a === 'zin') cue.win.zoom(0.1); if (a === 'zout') cue.win.zoom(-0.1); if (a === 'zreset') cue.win.zoom(0);
        if (a.startsWith('t-')) { S.theme = a.slice(2); applyTheme(S.theme); await cue.settings.set({ theme: S.theme }); }
        if (a === 'quit') cue.win.close();
        if (!a.startsWith('z') && !a.startsWith('t-')) close(); else { close(); kebab(anchor); }
      };
    });
  }

  // ---------------- session list ----------------
  async function viewList() {
    cue.win.liveHotkeys(false); cue.win.size(460, 720);
    let list = await cue.sessions.list();
    const draw = () => {
      const q = search.toLowerCase();
      let rows = list.filter((s) => !q || [s.company, s.role, s.title, s.description].join(' ').toLowerCase().includes(q));
      rows.sort((a, b) => (sortMode === 'new' ? b.createdAt - a.createdAt : sortMode === 'old' ? a.createdAt - b.createdAt : (a.company || a.title || '').localeCompare(b.company || b.title || '')));
      $('#cards').innerHTML = rows.length ? rows.map((s) => {
        const regular = s.type === 'regular'; const ended = s.status === 'ended';
        return `<div class="scard"><div class="top"><div class="date">${fmtDate(s.createdAt)}</div><div class="co">${esc(clean(regular ? s.title || 'Call' : s.company || s.title || 'Interview'))}</div><div class="rl">${esc(clean(regular ? s.description : s.role))}</div>
          <button class="dots" data-del="${s.id}" title="Delete">⋮</button>
          <div class="tags"><span class="pill">${regular ? '📞 Regular' : s.type === 'mock' ? '🎙 Mock' : '💼 Interview'}</span>${s.saveTranscript ? '<span class="pill">▤ Transcript</span>' : ''}</div></div>
          <div class="foot"><div class="grow"><div class="stat"><i class="${ended ? 'end' : ''}"></i>${ended ? 'Ended' : 'Ready to Start'}</div><div class="mute">${s.usageMs ? 'Used ' + fmtDur(s.usageMs) : 'No usage yet'}</div></div>
          ${ended ? `<button class="btn ghost sm" data-tr="${s.id}">View Transcript</button> ` : ''}<button class="btn" data-start="${s.id}">${ended ? 'Restart' : 'Start Session'}</button></div></div>`;
      }).join('') : '<div class="empty">No sessions yet. Create one to get started.</div>';
    };
    app.innerHTML = shell(`<div class="body"><div class="search"><input id="q" placeholder="🔍  Search by title or description" value="${esc(search)}" /><button class="ib" id="sort" title="Sort">⇅</button></div><div class="cards" id="cards"></div>
      <div class="footbar"><button class="btn ghost" id="toDash">View in Dashboard ↗</button><button class="btn green" id="create">＋ Create Session</button></div></div>`);
    bindHeader(); draw();
    $('#q').oninput = (e) => { search = e.target.value; draw(); };
    $('#sort').onclick = () => { sortMode = { new: 'old', old: 'az', az: 'new' }[sortMode]; toast('Sorted: ' + { new: 'newest first', old: 'oldest first', az: 'A–Z' }[sortMode], 1200); draw(); };
    $('#toDash').onclick = () => cue.win.openDashboard('sessions');
    $('#create').onclick = () => viewWizard();
    $('#cards').onclick = async (e) => {
      const t = e.target;
      if (t.dataset.start) viewConnect(t.dataset.start);
      if (t.dataset.tr) cue.win.openDashboard('sessions');
      if (t.dataset.del && confirm('Delete this session?')) { await cue.sessions.remove(t.dataset.del); list = list.filter((s) => s.id !== t.dataset.del); draw(); }
    };
  }

  // ---------------- create-session wizard ----------------
  let draft = null;
  const freshDraft = (type = 'interview') => ({ type, company: '', role: '', jobDescription: '', title: '', description: '', resumeId: '', docIds: [], folderPath: '', language: S.language || 'en', model: MODELS[0].id,
    prefs: { style: 'concise', format: 'speakable', code: true }, notes: '', autoGenerate: false, saveTranscript: true });

  async function viewWizard(step = 1) {
    if (!draft) draft = freshDraft();
    cue.win.size(560, 720);
    const docs = await cue.docs.list();
    const resumes = docs.filter((d) => d.kind === 'resume'), others = docs.filter((d) => d.kind === 'document');
    const side = `<div class="side"><h2>Create Session</h2><p>Enter the details & select what you need for this call.</p><div class="step ${step === 1 ? 'on' : ''}"><b>1</b>Details</div><div class="step ${step === 2 ? 'on' : ''}"><b>2</b>Preferences</div></div>`;
    let main;
    if (step === 1) {
      docs.forEach((d) => (docNames[d.id] = d.name));
      const docDD = `<button class="ddbtn" id="docBtn"><span>${esc(pickerLabel('document'))}</span><i>⌄</i></button>`;
      main = `<div class="tabs2"><button data-type="interview" class="${draft.type === 'interview' ? 'on' : ''}">💼 Interview</button><button data-type="regular" class="${draft.type === 'regular' ? 'on' : ''}">📞 Regular</button></div>` +
        (draft.type === 'interview' ? `<p class="mute">Have a link to the job post? Import the details automatically.</p><button class="btn ghost" id="imp">✨ Paste a job link</button><div class="row" id="impRow" style="display:none;margin-top:8px"><input id="impUrl" placeholder="https://…" /><button class="btn sm" id="impGo">Import</button></div>
          <label class="lbl">Company</label><input id="company" placeholder="Enter company name" value="${esc(draft.company)}" />
          <label class="lbl">Role <small>(Optional)</small></label><input id="role" placeholder="e.g. Data Engineer" value="${esc(draft.role)}" />
          <label class="lbl">Job Description</label><textarea id="jd" placeholder="Enter job description">${esc(draft.jobDescription)}</textarea>
          <div class="sechd">Context</div><div class="row" style="align-items:flex-start"><div class="grow"><label class="lbl">CV / Resume</label><button class="ddbtn" id="resumeBtn"><span>${esc(pickerLabel('resume'))}</span><i>⌄</i></button></div><div class="grow"><label class="lbl">Documents</label>${docDD}</div></div>`
        : `<label class="lbl">Call Title <small>(Optional)</small></label><input id="title" placeholder="Enter call title" value="${esc(draft.title)}" />
          <label class="lbl">Description <small>(Optional)</small></label><textarea id="desc" placeholder="Enter description">${esc(draft.description)}</textarea>
          <div class="sechd">Context</div><label class="lbl">Documents</label>${docDD}
          <label class="lbl">Project folder <small>(Cue reads the whole folder as context)</small></label><div class="row"><button class="btn ghost sm" id="pick">Choose folder…</button><span class="mute grow" id="folderInfo" style="word-break:break-all">${esc(draft.folderPath)}</span></div>`) +
        `<div class="wizfoot"><button class="btn ghost" id="cancel">Cancel</button><button class="btn" id="next">Next</button></div>`;
    } else {
      main = `<div class="sechd">Session</div>
        <div class="prow"><span class="ic">文</span><div class="grow"><div class="t">Select Language</div><div class="s">Call language</div></div><select id="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${draft.language === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="prow"><span class="ic">◈</span><div class="grow"><div class="t">Select Model</div><div class="s">Speed and accuracy</div></div><select id="model">${MODELS.map((m) => `<option value="${m.id}" ${draft.model === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div>
        <div class="prow"><span class="ic">⚙</span><div class="grow"><div class="t">Answer Preferences</div><div class="s">Answer style and format</div></div><button class="btn ghost sm" id="cfg">Configure</button></div>
        <div class="prow"><span class="ic">✨</span><div class="grow"><div class="t">AI Instructions</div><div class="s">Additional guidance</div></div><button class="btn ghost sm" id="ins">Edit</button></div>
        <div class="sechd">Extra</div>
        <div class="prow"><span class="ic">⚡</span><div class="grow"><div class="t">Auto Generate (Beta)</div><div class="s">Answers questions automatically</div></div><div class="toggle ${draft.autoGenerate ? 'on' : ''}" id="auto"></div></div>
        <div class="prow"><span class="ic">▤</span><div class="grow"><div class="t">Save Transcript</div><div class="s">Consent may be required</div></div><div class="toggle ${draft.saveTranscript ? 'on' : ''}" id="save"></div></div>
        <div class="wizfoot"><button class="btn ghost" id="back">Back</button><button class="btn" id="create">Create Session</button></div>`;
    }
    app.innerHTML = shell(`<div class="body"><div class="wiz">${side}<div class="main">${main}</div></div></div>`); bindHeader();

    const grab = () => {
      if (step !== 1) return;
      if (draft.type === 'interview') { draft.company = $('#company').value; draft.role = $('#role').value; draft.jobDescription = $('#jd').value; }
      else { draft.title = $('#title').value; draft.description = $('#desc').value; }
    };

    if (step === 1) {
      $$('.tabs2 button').forEach((b) => (b.onclick = () => { grab(); draft.type = b.dataset.type; viewWizard(1); }));
      $('#cancel').onclick = () => { draft = null; viewList(); };
      $('#docBtn').onclick = (e) => openPicker(e.currentTarget, 'document');
      if (draft.type === 'interview') {
        $('#resumeBtn').onclick = (e) => openPicker(e.currentTarget, 'resume');
        $('#imp').onclick = () => { $('#impRow').style.display = 'flex'; $('#impUrl').focus(); };
        $('#impGo').onclick = async () => {
          const url = $('#impUrl').value.trim(); if (!url) return; $('#impGo').disabled = true; $('#impGo').textContent = 'Importing…';
          try { const j = await cue.job.import(url); grab(); draft.company = clean(j.company); draft.role = clean(j.role); draft.jobDescription = clean(j.jobDescription); viewWizard(1); toast('Imported'); }
          catch (e) { toast(e.message, 5000); $('#impGo').disabled = false; $('#impGo').textContent = 'Import'; }
        };
        const ready = () => ($('#company').value.trim() || $('#jd').value.trim()); const sync = () => ($('#next').disabled = !ready());
        ['#company', '#jd'].forEach((s) => ($(s).oninput = sync)); sync();
      } else {
        $('#pick').onclick = async () => { grab(); const p = await cue.folder.pick(); if (!p) return; draft.folderPath = p; const f = await cue.folder.summary(p); viewWizard(1); toast(`${f.fileCount} files loaded as context`); };
      }
      $('#next').onclick = () => { grab(); viewWizard(2); };
    } else {
      $('#lang').onchange = (e) => (draft.language = e.target.value);
      $('#model').onchange = (e) => (draft.model = e.target.value);
      $('#auto').onclick = (e) => { draft.autoGenerate = !draft.autoGenerate; e.currentTarget.classList.toggle('on'); };
      $('#save').onclick = (e) => { draft.saveTranscript = !draft.saveTranscript; e.currentTarget.classList.toggle('on'); };
      $('#cfg').onclick = () => modal(`<b>Answer preferences</b><label class="lbl">Style</label><select id="ps"><option value="concise">Concise</option><option value="detailed">Detailed</option><option value="star">STAR for behavioral</option></select>
        <label class="lbl">Format</label><select id="pf"><option value="speakable">Speakable (natural first person)</option><option value="bullets">Bullet points</option><option value="paragraph">Paragraphs</option></select>
        <label class="lbl"><input type="checkbox" id="pc" style="width:auto"> Include code for coding questions</label><div class="wizfoot"><button class="btn" id="ok">Done</button></div>`, (b, close) => {
        $('#ps', b).value = draft.prefs.style; $('#pf', b).value = draft.prefs.format; $('#pc', b).checked = draft.prefs.code;
        $('#ok', b).onclick = () => { draft.prefs = { style: $('#ps', b).value, format: $('#pf', b).value, code: $('#pc', b).checked }; close(); };
      });
      $('#ins').onclick = () => modal(`<b>AI instructions</b><p class="mute">Tone, things to emphasize, topics to avoid…</p><textarea id="nt">${esc(draft.notes)}</textarea><div class="wizfoot"><button class="btn" id="ok">Save</button></div>`, (b, close) => { $('#ok', b).onclick = () => { draft.notes = $('#nt', b).value; close(); }; });
      $('#back').onclick = () => viewWizard(1);
      $('#create').onclick = async () => {
        const d = draft; const s = await cue.sessions.create({ ...d, title: d.title || (d.type === 'interview' ? d.company : 'Call') });
        draft = null; toast('Session created'); viewList();
      };
    }
  }

  // ---------------- connect ----------------
  async function viewConnect(sid) {
    cue.win.size(520, 520);
    const s = await cue.sessions.get(sid); if (!s) return viewList();
    app.innerHTML = shell(`<div class="body"><div class="connect"><h2>Connect Call Session</h2><p class="mute">This is an unlimited session. It ends when you stop it.</p>
      <div class="note">ⓘ<div>Always test Cue in a safe environment before your actual call. Make sure your Anthropic and Deepgram keys are set in Settings (⋮ menu).</div></div>
      <div class="note warn">⚠<div>To hear the other side of the call, Cue captures your computer's audio. Windows works out of the box. On macOS you need a loopback device such as BlackHole; without it Cue only hears your microphone.</div></div>
      <div class="row"><button class="btn ghost grow" id="back">Back</button><button class="btn grow" id="go">⬆ Connect</button></div></div></div>`); bindHeader();
    $('#back').onclick = viewList; $('#go').onclick = () => viewLive(sid);
  }

  // ---------------- live overlay ----------------
  async function viewLive(sid) {
    const s = await cue.sessions.get(sid); if (!s) return viewList();
    S = await cue.settings.get();
    const lines = []; const interim = {}; const answers = []; let idx = -1; let current = null; let chatMode = false; let pendingQ = []; let autoTimer = null;
    const channels = []; const t0 = Date.now(); let mic = false, sys = false;
    cue.win.size(900, 190); cue.win.liveHotkeys(true);
    await cue.sessions.update(sid, { status: 'live' });

    app.innerHTML = `<div class="shell live"><div class="lbar"><div class="dev"><span id="dMic" title="Microphone">🎤</span><span id="dSys" title="System audio">🔊</span></div>
      <button class="lbtn" id="bAns">Answer<kbd>⌘↵</kbd></button><button class="lbtn" id="bShot">Screenshot<kbd>⌘⇧↵</kbd></button><button class="lbtn" id="bChat">Chat<kbd>⌘⇧␣</kbd></button>
      ${s.type === 'mock' ? '<button class="lbtn" id="bNext">Next question</button>' : ''}<div class="grow"></div>
      <button class="lbtn sq mv" id="lMove" title="Move (⌘ + ⇧ + ✥)  ·  drag me, or use ⌘⇧ + arrow keys">✥</button><button class="lbtn sq" id="lCollapse" title="Hide">⤡</button><button class="lbtn sq" id="lMenu">⋮</button><button class="timer" id="timer" title="End session">0:00</button></div>
      <div class="lstat"><div class="wave"><i></i><i></i><i></i></div><div class="txt" id="ltxt">Connecting…</div><button class="lbtn" id="bClearTx">Clear<kbd>⌘⇧⌫</kbd></button></div>
      <div class="apanel" id="panel" style="display:none"></div></div>`;

    const setStatus = (t) => ($('#ltxt').textContent = t);
    const refreshLine = () => { const last = Object.entries(interim).map(([w, t]) => `${w}: ${t}`).pop() || (lines.length ? `${lines[lines.length - 1].speaker}: ${lines[lines.length - 1].text}` : 'Listening…'); if (!chatMode) setStatus(last); };
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

    // --- audio ---
    const key = await cue.deepgramKey();
    if (!key) { setStatus('Add your Deepgram key in Settings (⋮) — you can still use Chat and Screenshot.'); }
    else {
      try {
        const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const c1 = new Channel('You', onLine, onInterim, s.language, key); await c1.start(m); channels.push(c1); mic = true; $('#dMic').classList.add('on');
        try {
          const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); d.getVideoTracks().forEach((t) => t.stop());
          if (d.getAudioTracks().length) { const c2 = new Channel(s.type === 'regular' ? 'Participant' : 'Interviewer', onLine, onInterim, s.language, key); await c2.start(d); channels.push(c2); sys = true; $('#dSys').classList.add('on'); }
          else toast('No system audio captured — listening to your mic only', 5000);
        } catch { toast('System audio unavailable — listening to your mic only (macOS needs BlackHole)', 6000); }
        refreshLine();
      } catch (e) { setStatus(e.message); }
    }
    const timer = setInterval(() => { const sec = Math.floor((Date.now() - t0) / 1000); $('#timer').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }, 1000);

    // --- answer panel ---
    function renderPanel() {
      const p = $('#panel');
      if (idx < 0) { p.style.display = 'none'; cue.win.size(900, 190); return; }
      const a = answers[idx];
      if (p.style.display === 'none') { p.style.display = 'flex'; cue.win.size(900, 560); }
      p.innerHTML = `<div class="nav"><button id="pPrev">⌘←</button><button id="pNext">⌘→</button><span class="mute" style="color:#fff8">${idx + 1} / ${answers.length}</span><div class="grow"></div><button id="pCopy" class="copy" title="Copy answer">⧉</button><button class="lbtn" id="pClear">Clear <kbd>⌘⌫</kbd></button></div>
        <div class="acard"><div class="q">💬 Question: ${esc(a.q)}</div><div class="a">⭐ <b class="k">Answer:</b> ${md(a.a || '…')}</div><div class="meta">${esc(a.kind)} · ${new Date(a.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div>`;
      $('#pPrev').onclick = () => nav(-1); $('#pNext').onclick = () => nav(1);
      $('#pCopy').onclick = () => { navigator.clipboard.writeText(a.a); toast('Copied', 1200); };
      $('#pClear').onclick = clearAnswers;
    }
    const nav = (d) => { if (!answers.length) return; idx = (idx + d + answers.length) % answers.length; renderPanel(); };
    function clearAnswers() { answers.length = 0; idx = -1; renderPanel(); }

    const early = {}; // events that arrive before ask() has returned its request id
    const onChunk = ({ reqId, text }) => { if (!current || current.reqId !== reqId) { (early[reqId] ||= []).push(['c', { reqId, text }]); return; } current.a.a += text; if (answers[idx] === current.a) { const el = $('.acard .a'); if (el) el.innerHTML = `⭐ <b class="k">Answer:</b> ${md(current.a.a)}`; } };
    const onDone = ({ reqId, ok, error }) => { if (!current || current.reqId !== reqId) { (early[reqId] ||= []).push(['d', { reqId, ok, error }]); return; } if (!ok) current.a.a += (current.a.a ? '\n\n' : '') + '⚠ ' + error; current = null; renderPanel(); };
    cue.llm.onChunk(onChunk); cue.llm.onDone(onDone);

    async function ask({ kind = 'Answer', image = null, typed = '' } = {}) {
      if (current) return toast('Still answering — wait a moment', 1500);
      const lastQ = pendingQ.join(' ').trim();
      const q = typed || (image ? 'Screenshot analysis' : lastQ || 'Latest part of the conversation');
      const question = typed || (image ? '' : lastQ ? `Answer this question that was just asked in the conversation: ${lastQ}` : '');
      const a = { kind, q, a: '', t: Date.now() }; answers.push(a); idx = answers.length - 1; renderPanel();
      try {
        const reqId = await cue.llm.ask({ sessionId: sid, question, image, transcript: lines }); current = { reqId, a };
        pendingQ = [];
        for (const [k, d] of early[reqId] || []) (k === 'c' ? onChunk : onDone)(d); delete early[reqId];
      } catch (e) { a.a = '⚠ ' + e.message; renderPanel(); }
    }
    const shot = async () => { const img = await cue.capture.screenshot(); if (img) ask({ kind: 'Screenshot', image: img }); else toast('Screenshot failed'); };
    const openChat = () => {
      chatMode = true; $('#ltxt').outerHTML = `<input class="txt" id="chatIn" placeholder="Ask anything… (Enter to send, Esc to cancel)" style="flex:1">`; const el = $('#chatIn'); el.focus();
      const done = () => { chatMode = false; el.outerHTML = `<div class="txt" id="ltxt"></div>`; refreshLine(); };
      el.onkeydown = (e) => { if (e.key === 'Enter' && el.value.trim()) { const v = el.value.trim(); done(); ask({ kind: 'Chat', typed: v }); } if (e.key === 'Escape') done(); };
    };
    const clearTx = () => { lines.length = 0; for (const k in interim) delete interim[k]; pendingQ = []; persist(); setStatus('Listening…'); };

    $('#bAns').onclick = () => ask({}); $('#bShot').onclick = shot; $('#bChat').onclick = openChat; $('#bClearTx').onclick = clearTx;
    $('#lCollapse').onclick = hide;
    $('#lMenu').onclick = (e) => popMenu(e.currentTarget, `<div class="it" data-a="sum"><span class="grow">Summarize session</span></div><div class="it" data-a="dash"><span class="grow">Dashboard ↗</span></div><div class="it" data-a="screen"><span class="grow">Next Screen</span>→</div>
      <div class="it"><span class="grow">Opacity</span><input type="range" min="40" max="100" value="100" id="op" style="width:90px;padding:0"></div><div class="it" data-a="end"><span class="grow">End session</span></div>`, (m, close) => {
      $('#op', m).oninput = (ev) => cue.win.opacity(ev.target.value / 100);
      m.onclick = async (ev) => { const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; close();
        if (a === 'dash') cue.win.openDashboard('sessions'); if (a === 'screen') cue.win.nextScreen(); if (a === 'end') end();
        if (a === 'sum') { toast('Summarizing…'); try { textModal('Session summary', await cue.llm.summarize(sid)); } catch (e) { toast(e.message, 5000); } } };
    });
    if ($('#bNext')) $('#bNext').onclick = async () => {
      const resume = s.resumeId ? (await cue.docs.preview(s.resumeId)).slice(0, 8000) : '';
      const asked = lines.filter((l) => l.speaker === 'Interviewer').map((l) => l.text).join('\n');
      const q = (await cue.llm.complete({ system: 'You are a professional interviewer. Ask exactly ONE interview question at a time, tailored to the role. Output only the question.', model: s.model,
        user: `Company: ${s.company}\nRole: ${s.role}\nJob description:\n${s.jobDescription}\n\nCandidate resume:\n${resume}\n\nQuestions already asked:\n${asked || '(none)'}\n\nAsk the next question.` })).trim();
      onLine('Interviewer', q); speechSynthesis.speak(new SpeechSynthesisUtterance(q));
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
      viewList();
    }
    liveCleanup = () => { liveCleanup = null; clearInterval(timer); clearTimeout(autoTimer); channels.forEach((c) => c.stop()); window.removeEventListener('keydown', onKey); speechSynthesis.cancel(); cue.win.opacity(1); };
  }

  // ---------------- settings ----------------
  async function viewSettings() {
    cue.win.size(520, 720); S = await cue.settings.get();
    app.innerHTML = shell(`<div class="body"><h2 style="margin:4px 0">Settings</h2><p class="mute" style="margin-top:0">API keys are encrypted with your OS keychain and only sent to the provider you choose.</p>
      <label class="lbl">Default AI provider</label><select id="provider"><option value="anthropic">Anthropic Claude</option><option value="ollama">Local model (Ollama)</option></select>
      <label class="lbl">Anthropic API key</label><input id="anthropicKey" type="password" value="${esc(S.anthropicKey)}" />
      <div class="row"><div class="grow"><label class="lbl">Ollama URL</label><input id="ollamaUrl" value="${esc(S.ollamaUrl)}" /></div><div class="grow"><label class="lbl">Ollama model</label><input id="ollamaModel" value="${esc(S.ollamaModel)}" /></div></div>
      <label class="lbl">Deepgram API key (live transcription)</label><input id="deepgramKey" type="password" value="${esc(S.deepgramKey)}" />
      <div class="wizfoot"><button class="btn ghost" id="cancel">Back</button><button class="btn" id="save">Save</button></div></div>`); bindHeader();
    $('#provider').value = S.provider;
    $('#cancel').onclick = viewList;
    $('#save').onclick = async () => { const patch = {}; ['provider', 'anthropicKey', 'ollamaUrl', 'ollamaModel', 'deepgramKey'].forEach((k) => (patch[k] = $('#' + k).value)); S = await cue.settings.set(patch); toast('Saved'); viewList(); };
  }

  viewList();
})();
