if (MODE === 'widget') (() => {
  let S = {};            // global settings
  let sortMode = 'new';  // new | old | az
  let search = '';
  let liveCleanup = null;
  const MOD = /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';
  const view = (html) => { app.innerHTML = html; app.firstElementChild?.classList.add('view'); };

  cue.settings.get().then((s) => { S = s; applyTheme(s.theme || 'dark'); });

  // ---------- Hide: shrink the whole widget to a small floating logo. Click to restore, drag to move. ----------
  const bub = document.createElement('div'); bub.id = 'bub';
  bub.innerHTML = `<button id="bubLogo" title="Show ${BRAND.name}" aria-label="Show ${BRAND.name}">${mark(BRAND.mark, 26)}</button>`;
  document.body.appendChild(bub);
  function hide() { document.body.classList.add('bubble'); cue.win.bubble(true); }
  function restore() { document.body.classList.remove('bubble'); cue.win.bubble(false); }
  (() => {
    const el = $('#bubLogo'); let d = null;
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); d = { x: e.screenX, y: e.screenY, moved: false }; });
    el.addEventListener('pointermove', (e) => { if (!d) return; const dx = e.screenX - d.x, dy = e.screenY - d.y; if (!d.moved && Math.hypot(dx, dy) < 4) return; d.moved = true; d.x = e.screenX; d.y = e.screenY; cue.win.moveBy(dx, dy); });
    el.addEventListener('pointerup', () => { if (d && !d.moved) restore(); d = null; });
  })();

  // ---------- Resume / document picker (dropdown with Refresh + Upload, opens upward when near the bottom) ----------
  const docNames = {};
  const pickerLabel = (kind) => (kind === 'resume' ? docNames[draft.resumeId] || 'Select a resume…' : draft.docIds.length ? `${draft.docIds.length} selected` : 'Select documents');
  function openPicker(anchor, kind) {
    $$('.menu').forEach((x) => x.remove());
    const multi = kind === 'document';
    const m = document.createElement('div'); m.className = 'menu pick'; document.body.appendChild(m);
    const off = (e) => { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); };
    const close = () => { m.remove(); document.removeEventListener('mousedown', off, true); };
    setTimeout(() => document.addEventListener('mousedown', off, true));
    const place = () => {
      const r = anchor.getBoundingClientRect(); m.style.width = Math.max(r.width, 240) + 'px'; m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + 'px';
      const h = m.offsetHeight; const up = r.bottom + h + 10 > innerHeight; m.style.transformOrigin = up ? 'bottom left' : 'top left'; m.style.top = (up ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    };
    const draw = async () => {
      const items = (await cue.docs.list()).filter((d) => d.kind === kind); items.forEach((d) => (docNames[d.id] = d.name));
      const sel = multi ? draft.docIds : [draft.resumeId];
      m.innerHTML = `<div class="plist">${items.map((d) => `<div class="it" data-id="${d.id}">${multi ? `<input type="checkbox" ${sel.includes(d.id) ? 'checked' : ''}>` : ''}${ic('file-text', 15)}<span class="grow">${esc(d.name)}</span>${!multi && sel[0] === d.id ? ic('check', 15) : ''}</div>`).join('') || `<div class="it mute">No ${multi ? 'documents' : 'resumes'} yet</div>`}</div><div class="sep"></div>
        <div class="it" data-a="refresh">${ic('refresh-cw', 15)}Refresh ${multi ? 'documents' : 'resumes'}</div><div class="it" data-a="upload">${ic('upload', 15)}Upload a ${multi ? 'document' : 'resume'}</div>`;
      place();
    };
    m.onclick = async (e) => {
      const row = e.target.closest('.it'); if (!row) return;
      if (row.dataset.a === 'refresh') { await draw(); toast('Refreshed', 900); return; }
      if (row.dataset.a === 'upload') {
        const r = await cue.docs.importFiles(kind); r.filter((x) => x.error).forEach((x) => toast(x.error, 5000));
        r.filter((x) => x.id).forEach((x) => { docNames[x.id] = x.name; if (multi) draft.docIds.push(x.id); else draft.resumeId = x.id; });
        anchor.firstElementChild.textContent = pickerLabel(kind); await draw(); if (!multi && r.some((x) => x.id)) close(); return;
      }
      const id = row.dataset.id; if (!id) return;
      if (multi) { draft.docIds = draft.docIds.includes(id) ? draft.docIds.filter((x) => x !== id) : [...draft.docIds, id]; await draw(); }
      else { draft.resumeId = draft.resumeId === id ? '' : id; close(); }
      anchor.firstElementChild.textContent = pickerLabel(kind);
    };
    draw();
  }
  cue.onGotoLive((sid) => (sid === '__new' ? viewWizard() : viewConnect(sid)));

  // ---------------- shell + header ----------------
  const shell = (inner, cls = '') => `<div class="shell ${cls}"><div class="hdr"><div class="brand">${brandHTML()}</div><span class="tier" title="Runs on your computer — no paid keys needed"><i></i>Free · Local</span>
    <button class="ib" id="hCollapse" title="Hide">${ic('minimize-2', 16)}</button><button class="ib mv" title="Move (${MOD} + ⇧ + ✥)  ·  drag me, or use ${MOD}⇧ + arrow keys during a live session" style="-webkit-app-region:drag;cursor:grab">${ic('move', 16)}</button><button class="ib" id="hMenu" title="Menu">${ic('ellipsis-vertical', 16)}</button><button class="ib close" id="hClose" title="Close">${ic('x', 16)}</button></div>${inner}</div>`;
  function bindHeader() {
    $('#hCollapse').onclick = hide;
    $('#hClose').onclick = () => cue.win.close();
    $('#hMenu').onclick = (e) => kebab(e.currentTarget);
  }
  function kebab(anchor) {
    popMenu(anchor, `<div class="it mute">${BRAND.name} ${BRAND.suffix} · local &amp; private</div><div class="sep"></div>
      <div class="it" data-a="dash">${ic('layout-grid', 15)}<span class="grow">Dashboard</span>${ic('arrow-up-right', 14)}</div>
      <div class="it" data-a="screen">${ic('monitor', 15)}<span class="grow">Next Screen</span></div>
      <div class="it" data-a="settings">${ic('settings', 15)}<span class="grow">Setup &amp; Settings</span></div>
      <div class="it">${ic('search', 15)}<span class="grow">Zoom</span><span class="rnd" data-a="zin">${ic('plus', 14)}</span><span class="rnd" data-a="zout" style="margin-left:4px">−</span><span class="rnd" data-a="zreset" style="margin-left:4px">${ic('rotate-ccw', 14)}</span></div>
      <div class="it">${ic('sun', 15)}<span class="grow">Theme</span><span class="rnd ${S.theme === 'light' ? 'on' : ''}" data-a="t-light">${ic('sun', 14)}</span><span class="rnd ${S.theme === 'dark' ? 'on' : ''}" data-a="t-dark" style="margin-left:4px">${ic('moon', 14)}</span><span class="rnd ${S.theme === 'system' ? 'on' : ''}" data-a="t-system" style="margin-left:4px">${ic('monitor', 14)}</span></div>
      <div class="sep"></div><div class="it" data-a="quit">${ic('power', 15)}<span class="grow">Quit ${BRAND.name}</span></div>`, (m, close) => {
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
    const kindPill = (s) => (s.type === 'regular' ? `${ic('phone', 12)}Regular` : s.type === 'mock' ? `${ic('mic', 12)}Mock` : `${ic('briefcase-business', 12)}Interview`);
    const draw = () => {
      const q = search.toLowerCase();
      let rows = list.filter((s) => !q || [s.company, s.role, s.title, s.description].join(' ').toLowerCase().includes(q));
      rows.sort((a, b) => (sortMode === 'new' ? b.createdAt - a.createdAt : sortMode === 'old' ? a.createdAt - b.createdAt : (a.company || a.title || '').localeCompare(b.company || b.title || '')));
      $('#cards').innerHTML = rows.length ? rows.map((s) => {
        const regular = s.type === 'regular'; const ended = s.status === 'ended';
        return `<div class="scard"><div class="date">${fmtDate(s.createdAt)}</div><div class="co">${esc(clean(regular ? s.title || 'Call' : s.company || s.title || 'Interview'))}</div><div class="rl">${esc(clean(regular ? s.description : s.role)) || '&nbsp;'}</div>
          <button class="dots" data-del="${s.id}" title="Delete session">${ic('trash-2', 15)}</button>
          <div class="tags"><span class="pill">${kindPill(s)}</span>${s.saveTranscript ? `<span class="pill">${ic('file-text', 12)}Transcript</span>` : ''}</div>
          <div class="foot"><div class="grow"><div class="stat"><i class="${ended ? 'end' : ''}"></i>${ended ? 'Ended' : 'Ready to start'}</div><div class="mute" style="font-size:12px">${s.usageMs ? 'Used ' + fmtDur(s.usageMs) : 'No usage yet'}</div></div>
          ${ended ? `<button class="btn ghost sm" data-tr="${s.id}">View Transcript</button>` : ''}<button class="btn sm ${ended ? '' : 'primary'}" data-start="${s.id}">${ic('play', 13)}${ended ? 'Restart' : 'Start Session'}</button></div></div>`;
      }).join('') : `<div class="empty">${ic('sparkles', 28)}<b style="color:var(--text)">No sessions yet</b><span>Create one to get interview or meeting help in real time.</span></div>`;
    };
    view(shell(`<div class="body"><div class="search"><div class="sbox">${ic('search', 15)}<input id="q" placeholder="Search by title or description" value="${esc(search)}" /></div><button class="ib boxed" id="sort" title="Sort" style="width:38px;height:38px">${ic('arrow-up-down', 16)}</button></div><div class="cards" id="cards"></div>
      <div class="footbar"><button class="btn ghost" id="toDash">View in Dashboard${ic('arrow-up-right', 15)}</button><button class="btn primary" id="create">${ic('plus', 16)}Create Session</button></div></div>`));
    bindHeader(); draw();
    $('#q').oninput = (e) => { search = e.target.value; draw(); };
    $('#sort').onclick = () => { sortMode = { new: 'old', old: 'az', az: 'new' }[sortMode]; toast('Sorted: ' + { new: 'newest first', old: 'oldest first', az: 'A–Z' }[sortMode], 1200); draw(); };
    $('#toDash').onclick = () => cue.win.openDashboard('sessions');
    $('#create').onclick = () => viewWizard();
    $('#cards').onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.start) viewConnect(t.dataset.start);
      if (t.dataset.tr) cue.win.openDashboard('sessions');
      if (t.dataset.del && confirm('Delete this session?')) { await cue.sessions.remove(t.dataset.del); list = list.filter((s) => s.id !== t.dataset.del); draw(); }
    };
  }

  // ---------------- create-session wizard ----------------
  let draft = null;
  const freshDraft = (type = 'interview') => ({ type, company: '', role: '', jobDescription: '', title: '', description: '', resumeId: '', docIds: [], folderPath: '', language: S.language || 'en', model: 'ollama:local',
    prefs: { style: 'concise', format: 'speakable', code: true }, notes: '', autoGenerate: false, saveTranscript: true });

  async function viewWizard(step = 1) {
    S = await cue.settings.get();
    if (!draft) draft = freshDraft();
    cue.win.size(580, 720);
    const docs = await cue.docs.list();
    const side = `<div class="side"><h2>Create Session</h2><p>Enter the details and pick what you need for this call.</p><div class="step ${step === 1 ? 'on' : ''}"><b>1</b>Details</div><div class="step ${step === 2 ? 'on' : ''}"><b>2</b>Preferences</div></div>`;
    let main;
    if (step === 1) {
      docs.forEach((d) => (docNames[d.id] = d.name));
      const dd = (id, kind) => `<button class="ddbtn" id="${id}"><span>${esc(pickerLabel(kind))}</span>${ic('chevron-down', 15)}</button>`;
      main = `<div class="tabs2"><button data-type="interview" class="${draft.type === 'interview' ? 'on' : ''}">${ic('briefcase-business', 15)}Interview</button><button data-type="regular" class="${draft.type === 'regular' ? 'on' : ''}">${ic('phone', 15)}Regular</button></div>` +
        (draft.type === 'interview' ? `<div class="row" style="margin-top:14px"><div class="grow mute" style="font-size:12.5px">Have a link to the job post? Import the details automatically.</div><button class="btn ghost sm" id="imp">${ic('link', 14)}Paste a job link</button></div><div class="row" id="impRow" style="display:none;margin-top:8px"><input id="impUrl" placeholder="https://…" /><button class="btn sm" id="impGo">Import</button></div>
          <label class="lbl">Company</label><input id="company" placeholder="Enter company name" value="${esc(draft.company)}" />
          <label class="lbl">Role <small>(optional)</small></label><input id="role" placeholder="e.g. Data Engineer" value="${esc(draft.role)}" />
          <label class="lbl">Job description</label><textarea id="jd" placeholder="Paste the job description">${esc(draft.jobDescription)}</textarea>
          <div class="sechd">Context</div><div class="row" style="align-items:flex-start"><div class="grow"><label class="lbl" style="margin-top:6px">CV / Resume</label>${dd('resumeBtn', 'resume')}</div><div class="grow"><label class="lbl" style="margin-top:6px">Documents</label>${dd('docBtn', 'document')}</div></div>`
        : `<label class="lbl">Call title <small>(optional)</small></label><input id="title" placeholder="Enter call title" value="${esc(draft.title)}" />
          <label class="lbl">Description <small>(optional)</small></label><textarea id="desc" placeholder="What is this call about?">${esc(draft.description)}</textarea>
          <div class="sechd">Context</div><label class="lbl" style="margin-top:6px">Documents</label>${dd('docBtn', 'document')}
          <label class="lbl">Project folder <small>(${BRAND.name} reads the whole folder as context)</small></label><div class="row"><button class="btn ghost sm" id="pick">${ic('folder-open', 14)}Choose folder…</button><span class="mute grow" id="folderInfo" style="word-break:break-all;font-size:12px">${esc(draft.folderPath)}</span></div>`) +
        `<div class="wizfoot"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="next">Next${ic('arrow-right', 15)}</button></div>`;
    } else {
      const pi = (n) => `<span class="pi">${ic(n, 16)}</span>`;
      main = `<div class="sechd" style="margin-top:2px">Session</div>
        <div class="prow">${pi('globe')}<div class="grow"><div class="t">Language</div><div class="s">Language spoken on the call</div></div><select id="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${draft.language === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="prow">${pi('cpu')}<div class="grow"><div class="t">AI model</div><div class="s">Speed and accuracy</div></div><select id="model">${modelList(S).map((m) => `<option value="${m.id}" ${draft.model === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div>
        <div class="prow">${pi('settings')}<div class="grow"><div class="t">Answer preferences</div><div class="s">Style and format</div></div><button class="btn ghost sm" id="cfg">Configure</button></div>
        <div class="prow">${pi('sparkles')}<div class="grow"><div class="t">AI instructions</div><div class="s">Additional guidance</div></div><button class="btn ghost sm" id="ins">Edit</button></div>
        <div class="sechd">Extra</div>
        <div class="prow">${pi('zap')}<div class="grow"><div class="t">Auto Generate <span class="pill accent" style="margin-left:4px">Beta</span></div><div class="s">Answers questions automatically</div></div><div class="toggle ${draft.autoGenerate ? 'on' : ''}" id="auto" role="switch" tabindex="0"></div></div>
        <div class="prow">${pi('file-text')}<div class="grow"><div class="t">Save transcript</div><div class="s">Stored only on this computer</div></div><div class="toggle ${draft.saveTranscript ? 'on' : ''}" id="save" role="switch" tabindex="0"></div></div>
        <div class="wizfoot"><button class="btn ghost" id="back">${ic('arrow-left', 15)}Back</button><button class="btn primary" id="create">Create Session</button></div>`;
    }
    view(shell(`<div class="body"><div class="wiz">${side}<div class="main">${main}</div></div></div>`)); bindHeader();

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
      const tg = (id, key) => { const el = $(id); const go = () => { draft[key] = !draft[key]; el.classList.toggle('on'); }; el.onclick = go; el.onkeydown = (e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), go()); };
      $('#lang').onchange = (e) => (draft.language = e.target.value);
      $('#model').onchange = (e) => (draft.model = e.target.value);
      tg('#auto', 'autoGenerate'); tg('#save', 'saveTranscript');
      $('#cfg').onclick = () => modal(`<b style="font-size:16px">Answer preferences</b><label class="lbl">Style</label><select id="ps"><option value="concise">Concise</option><option value="detailed">Detailed</option><option value="star">STAR for behavioral</option></select>
        <label class="lbl">Format</label><select id="pf"><option value="speakable">Speakable (natural first person)</option><option value="bullets">Bullet points</option><option value="paragraph">Paragraphs</option></select>
        <label class="lbl" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pc"> Include code for coding questions</label><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" id="ok">Done</button></div>`, (b, close) => {
        $('#ps', b).value = draft.prefs.style; $('#pf', b).value = draft.prefs.format; $('#pc', b).checked = draft.prefs.code;
        $('#ok', b).onclick = () => { draft.prefs = { style: $('#ps', b).value, format: $('#pf', b).value, code: $('#pc', b).checked }; close(); };
      });
      $('#ins').onclick = () => modal(`<b style="font-size:16px">AI instructions</b><p class="mute" style="margin:4px 0 10px">Tone, things to emphasize, topics to avoid…</p><textarea id="nt">${esc(draft.notes)}</textarea><div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary" id="ok">Save</button></div>`, (b, close) => { $('#ok', b).onclick = () => { draft.notes = $('#nt', b).value; close(); }; });
      $('#back').onclick = () => viewWizard(1);
      $('#create').onclick = async () => {
        const d = draft; await cue.sessions.create({ ...d, title: d.title || (d.type === 'interview' ? d.company : 'Call') });
        draft = null; toast('Session created'); viewList();
      };
    }
  }

  // ---------------- connect ----------------
  async function viewConnect(sid) {
    cue.win.size(540, 640);
    const s = await cue.sessions.get(sid); if (!s) return viewList();
    view(shell(`<div class="body"><div class="connect"><h2>Connect call session</h2><p class="mute" style="margin:0 0 14px">Unlimited and free — it ends when you stop it.</p>
      <div id="chk"></div>
      <div class="note warn">${ic('headphones', 16)}<div>To hear the other side of the call, ${BRAND.name} captures your computer's audio. Windows works out of the box. On macOS you need a loopback device such as BlackHole; without it ${BRAND.name} only hears your microphone.</div></div>
      <div class="note">${ic('shield-check', 16)}<div>Test in a safe environment before the real call. Audio and answers are processed on this computer.</div></div>
      <div class="row" style="margin-top:6px"><button class="btn ghost grow" id="back">Back</button><button class="btn primary grow" id="go">${ic('power', 15)}Connect</button></div></div></div>`)); bindHeader();
    setupPanel($('#chk'), s.language);
    $('#back').onclick = viewList; $('#go').onclick = () => viewLive(sid);
  }

  // ---------------- live overlay ----------------
  async function viewLive(sid) {
    const s = await cue.sessions.get(sid); if (!s) return viewList();
    S = await cue.settings.get();
    const lines = []; const interim = {}; const answers = []; let idx = -1; let current = null; let chatMode = false; let pendingQ = []; let autoTimer = null;
    const channels = []; const t0 = Date.now();
    cue.win.size(940, 190); cue.win.liveHotkeys(true); cue.setup.warm(); // preload the AI model so the first answer is instant
    await cue.sessions.update(sid, { status: 'live' });
    $('#bubLogo').classList.add('run');

    view(`<div class="live-root"><div class="lbar glass"><div class="dev"><span id="dMic" title="Microphone">${ic('mic', 15)}</span><span id="dSys" title="System audio">${ic('volume-2', 15)}</span></div>
      <button class="lbtn primary" id="bAns">${ic('sparkles', 15)}Answer<kbd>${MOD}↵</kbd></button><button class="lbtn" id="bShot">${ic('camera', 15)}Screenshot<kbd>${MOD}⇧↵</kbd></button><button class="lbtn" id="bChat">${ic('message-square-text', 15)}Chat<kbd>${MOD}⇧␣</kbd></button>
      ${s.type === 'mock' ? `<button class="lbtn" id="bNext">${ic('mic', 15)}Next question</button>` : ''}<div class="grow"></div>
      <button class="lbtn sq mv" id="lMove" title="Move (${MOD} + ⇧ + ✥)  ·  drag me, or use ${MOD}⇧ + arrow keys" style="-webkit-app-region:drag;cursor:grab">${ic('move', 16)}</button><button class="lbtn sq" id="lCollapse" title="Hide">${ic('minimize-2', 16)}</button><button class="lbtn sq" id="lMenu" title="Menu">${ic('ellipsis-vertical', 16)}</button><button class="timer" id="timer" title="End session">0:00</button></div>
      <div class="lstat glass"><div class="wave idle" id="wave"><i></i><i></i><i></i><i></i></div><div class="txt" id="ltxt">Connecting…</div><button class="lbtn" id="bClearTx">${ic('eraser', 15)}Clear<kbd>${MOD}⇧⌫</kbd></button></div>
      <div class="apanel glass" id="panel" style="display:none"></div></div>`);

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
    const key = S.stt === 'deepgram' ? await cue.deepgramKey() : '';
    const makeChannel = (label) => (key ? new Channel(label, onLine, onInterim, s.language, key) : new LocalChannel(label, onLine, onInterim, s.language));
    (async () => {
      try {
        if (!key) {
          setStatus('Loading speech model…'); progressSink = (p) => p.kind === 'stt' && setStatus(`Downloading speech model… ${p.pct ?? ''}%`);
          try { await cue.setup.initStt(s.language); } finally { progressSink = null; }
        }
        const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const c1 = makeChannel('You'); await c1.start(m); channels.push(c1); $('#dMic')?.classList.add('on');
        try {
          const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); d.getVideoTracks().forEach((t) => t.stop());
          if (d.getAudioTracks().length) { const c2 = makeChannel(s.type === 'regular' ? 'Participant' : 'Interviewer'); await c2.start(d); channels.push(c2); $('#dSys')?.classList.add('on'); }
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
      if (idx < 0) { p.style.display = 'none'; cue.win.size(940, 190); return; }
      const a = answers[idx];
      if (p.style.display === 'none') { p.style.display = 'flex'; cue.win.size(940, 520); }
      const live = current && current.a === a;
      p.innerHTML = `<div class="nav"><button class="nb" id="pPrev" title="Previous">${ic('chevron-left', 14)}${MOD}←</button><button class="nb" id="pNext" title="Next">${MOD}→${ic('chevron-right', 14)}</button><span class="cnt">${idx + 1} / ${answers.length}</span><div class="grow"></div><button class="lbtn sq" id="pCopy" title="Copy answer">${ic('copy', 15)}</button><button class="lbtn" id="pClear">${ic('eraser', 14)}Clear<kbd>${MOD}⌫</kbd></button></div>
        <div class="acard"><div class="q">${ic('message-square-text', 15)}<span>${esc(a.q)}</span></div><div class="a ${live ? 'live' : ''}">${md(a.a || '…')}</div><div class="meta">${esc(a.kind)} · ${new Date(a.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div>`;
      $('#pPrev').onclick = () => nav(-1); $('#pNext').onclick = () => nav(1);
      $('#pCopy').onclick = () => { navigator.clipboard.writeText(a.a); toast('Copied', 1200); };
      $('#pClear').onclick = clearAnswers;
    }
    const nav = (d) => { if (!answers.length) return; idx = (idx + d + answers.length) % answers.length; renderPanel(); };
    function clearAnswers() { answers.length = 0; idx = -1; renderPanel(); }

    const early = {}; // events that arrive before ask() has returned its request id
    const onChunk = ({ reqId, text }) => { if (!current || current.reqId !== reqId) { (early[reqId] ||= []).push(['c', { reqId, text }]); return; } current.a.a += text; if (answers[idx] === current.a) { const el = $('.acard .a'); if (el) el.innerHTML = md(current.a.a); } };
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
    $('#lCollapse').onclick = hide;
    $('#lMenu').onclick = (e) => popMenu(e.currentTarget, `<div class="it" data-a="sum">${ic('book-open', 15)}<span class="grow">Summarize session</span></div><div class="it" data-a="dash">${ic('layout-grid', 15)}<span class="grow">Dashboard</span>${ic('arrow-up-right', 14)}</div><div class="it" data-a="screen">${ic('monitor', 15)}<span class="grow">Next Screen</span></div>
      <div class="it">${ic('eye', 15)}<span class="grow">Opacity</span><input type="range" min="40" max="100" value="100" id="op" style="width:90px"></div><div class="sep"></div><div class="it" data-a="end">${ic('power', 15)}<span class="grow">End session</span></div>`, (m, close) => {
      $('#op', m).oninput = (ev) => cue.win.opacity(ev.target.value / 100);
      m.onclick = async (ev) => { const a = ev.target.closest('[data-a]')?.dataset.a; if (!a) return; close();
        if (a === 'dash') cue.win.openDashboard('sessions'); if (a === 'screen') cue.win.nextScreen(); if (a === 'end') end();
        if (a === 'sum') { toast('Summarizing…'); try { textModal('Session summary', await cue.llm.summarize(sid)); } catch (e) { toast(e.message, 5000); } } };
    });
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
    view(shell(`<div class="body"><h2 style="margin:4px 0 2px;letter-spacing:-.02em">Setup &amp; Settings</h2><p class="mute" style="margin:0 0 14px">${BRAND.name} runs fully on your computer for free. Cloud engines are optional.</p>
      <div id="chk"></div>
      <details class="adv"><summary>${ic('cloud', 16)}Cloud engines (optional)${ic('chevron-down', 16)}</summary><div>
        <p class="mute" style="margin:0 0 4px;font-size:12.5px">Not needed. Add keys later if you want faster or smarter cloud models. Keys are encrypted with your OS keychain.</p>
        <label class="lbl">Anthropic API key</label><input id="anthropicKey" type="password" value="${esc(S.anthropicKey)}" placeholder="sk-ant-…" />
        <label class="lbl">Deepgram API key</label><input id="deepgramKey" type="password" value="${esc(S.deepgramKey)}" />
        <label class="lbl">Speech recognition engine</label><select id="stt"><option value="local">Local Whisper (free)</option><option value="deepgram">Deepgram (cloud, needs key)</option></select>
      </div></details>
      <details class="adv"><summary>${ic('cpu', 16)}Local engine options${ic('chevron-down', 16)}</summary><div><div class="row"><div class="grow"><label class="lbl">Ollama URL</label><input id="ollamaUrl" value="${esc(S.ollamaUrl)}" /></div></div></div></details>
      <div class="wizfoot"><button class="btn ghost" id="cancel">Back</button><button class="btn primary" id="save">Save</button></div></div>`)); bindHeader();
    $('#stt').value = S.stt || 'local';
    setupPanel($('#chk'), S.language);
    $('#cancel').onclick = viewList;
    $('#save').onclick = async () => {
      const patch = {}; ['anthropicKey', 'deepgramKey', 'stt', 'ollamaUrl'].forEach((k) => (patch[k] = $('#' + k).value));
      patch.provider = patch.anthropicKey ? S.provider : 'ollama'; S = await cue.settings.set(patch); toast('Saved'); viewList();
    };
  }

  viewList();
})();
