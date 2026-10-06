if (MODE === 'dashboard') (() => {
  let page = new URLSearchParams(location.search).get('page') || 'sessions';
  const st = { tab: 'all', type: 'all', q: '', sort: 'new', layout: 'grid', banner: true, sid: null, view: 'session' };
  let waveCtl = null; // the open recording card (so its audio and animation loop are released when the page re-renders)
  cue.onDashNav((p) => { if (p === 'settings') return settingsModal(); page = p; render(); });
  cue.settings.get().then((s) => applyTheme(s.theme || 'dark'));

  const NAV = [['sessions', 'audio-lines', 'Call Sessions'], ['resumes', 'file-user', 'Resumes'], ['documents', 'folders', 'Documents'], ['video', 'layers', 'Session Video']];
  const PREP = [['questions', 'book-open', 'Question Bank'], ['mock', 'mic', 'Audio Rehearsal'], ['maker', 'wand-sparkles', 'Resume Maker']];
  const link = ([id, icon, label]) => `<a data-p="${id}" class="${page === id || (page === 'session' && id === 'sessions') ? 'on' : ''}">${ic(icon, 16)}${label}</a>`;

  function frame(title, sub, body, action = '') {
    app.innerHTML = `<div class="dash view"><aside class="sb"><div class="brand">${brandHTML()}</div><button class="btn primary" id="newSess">${ic('plus', 16)}Create Session</button>
      <div class="grp">Call Assistant</div><div class="nav">${NAV.map(link).join('')}</div><div class="grp">Prepare</div><div class="nav">${PREP.map(link).join('')}</div>
      <div class="foot"><b>${ic('zap', 15)}Cloud engines</b>Answers via OpenAI, Gemini, Claude or Groq; live captions via Deepgram. Sessions, resumes and documents stay on this computer.<div class="gap"></div><button class="btn ghost sm" id="gear">${ic('settings', 14)}Setup &amp; Settings</button></div></aside>
      <section class="mainc"><div class="pagehd"><div class="grow"><h1>${title}</h1><p>${sub}</p></div>${action}</div><div class="pagebd" id="bd">${body}</div></section></div>`;
    $$('.nav a').forEach((a) => (a.onclick = () => { page = a.dataset.p; st.tab = 'all'; st.type = 'all'; st.q = ''; render(); }));
    $('#newSess').onclick = () => cue.win.startSession('__new');
    $('#gear').onclick = settingsModal;
  }

  const filterSort = (rows, nameOf, dateOf) => {
    const q = st.q.toLowerCase();
    rows = rows.filter((r) => !q || nameOf(r).toLowerCase().includes(q));
    return sortRows(rows, st.sort, dateOf);
  };
  const toolbar = (ph, extra = '') => `<div class="tools"><div class="sbox">${ic('search', 15)}<input id="q" placeholder="${ph}" value="${esc(st.q)}" /></div><button class="ib boxed" id="sort" title="Sort" style="width:38px;height:38px">${ic('arrow-up-down', 16)}</button><div class="grow"></div>${extra}<button class="ib boxed" id="lay" title="Toggle layout" style="width:38px;height:38px">${ic(st.layout === 'grid' ? 'list' : 'layout-grid', 16)}</button></div>`;
  const bindToolbar = () => {
    $('#q').oninput = (e) => { st.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
    $('#sort').onclick = (e) => sortMenu(e.currentTarget, st.sort, (v) => { st.sort = v; render(); }, page === 'sessions' ? SORTS : SORTS.filter(([v]) => v !== 'status'));
    $('#lay').onclick = () => { st.layout = st.layout === 'grid' ? 'list' : 'grid'; render(); };
  };
  const tabs = (list) => `<div class="tabsb">${list.map(([id, l]) => `<button data-t="${id}" class="${st.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const bindTabs = () => $$('.tabsb button').forEach((b) => (b.onclick = () => { st.tab = b.dataset.t; render(); }));

  // ---------------- Call Sessions ----------------
  async function pSessions() {
    const all = await cue.sessions.list();
    const rows = filterSort(all.filter((s) => st.type === 'all' || s.type === st.type), (s) => [s.company, s.role, s.title, s.description].join(' '), (s) => s.createdAt);
    const active = st.tab === 'past' ? [] : rows.filter((s) => s.status !== 'ended'), past = st.tab === 'active' ? [] : rows.filter((s) => s.status === 'ended');
    const kind = (s) => (s.type === 'regular' ? `${ic('phone', 12)}Regular` : s.type === 'mock' ? `${ic('mic', 12)}Mock` : `${ic('briefcase-business', 12)}Interview`);
    const card = (s) => {
      const regular = s.type === 'regular', ended = s.status === 'ended';
      return `<div class="dcard"><div class="eyebrow">${fmtDate(s.createdAt)}</div><div class="nm">${esc(clean(regular ? s.title || 'Call' : s.company || s.title))}</div><div class="sub">${esc(clean(regular ? s.description : s.role)) || '&nbsp;'}</div>
        <button class="dots" data-del="${s.id}" title="Delete session">${ic('trash-2', 15)}</button><div class="tags"><span class="pill">${kind(s)}</span>${s.saveTranscript ? `<span class="pill">${ic('file-text', 12)}Transcript</span>` : ''}</div>
        <div class="meta"><div class="grow"><div class="stat"><i class="${ended ? 'end' : ''}"></i>${ended ? 'Ended' : 'Ready to start'}</div><div class="mute" style="font-size:12px">${s.usageMs ? fmtDur(s.usageMs) : 'No usage yet'}</div></div>
        <button class="btn ghost sm" data-open="${s.id}">${ended ? 'View Session' : 'Details'}</button><button class="btn sm ${ended ? '' : 'primary'}" data-start="${s.id}">${ic('play', 13)}${ended ? 'Restart' : 'Start Session'}</button></div></div>`;
    };
    const group = (name, arr) => `<div class="gh">${ic('chevron-down', 15)}${name} <span>${arr.length}</span></div><div class="grid ${st.layout}">${arr.map(card).join('') || `<div class="empty">${ic('sparkles', 28)}Nothing here yet.</div>`}</div>`;
    frame('Call Sessions', 'Prepare for calls and review past sessions.',
      (st.banner ? `<div class="banner"><button class="ib" id="xban" style="position:absolute;right:14px;top:14px" title="Dismiss">${ic('x', 16)}</button><div class="eyebrow">Mock interview</div><h2>Rehearse the interview before the real one.</h2><p>An AI interviewer asks the questions out loud while ${BRAND.name} drafts your answers beside you — exactly as it will on the day.</p><button class="btn primary" id="mockGo">${ic('mic', 15)}Start a mock interview</button></div>` : '') +
      tabs([['all', 'All'], ['active', 'Active'], ['past', 'Past']]) + toolbar('Search by role or company', `<select id="typeSel" aria-label="Session type" style="width:auto;height:38px;margin-right:8px">${[['all', 'All types'], ['interview', 'Interview'], ['regular', 'Regular'], ['mock', 'Mock']].map(([v, l]) => `<option value="${v}" ${st.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`) + (st.tab !== 'past' ? group('Active', active) : '') + (st.tab !== 'active' ? group('Past', past) : ''),
      `<button class="btn primary" id="topNew">${ic('plus', 16)}Create Session</button>`);
    bindTabs(); bindToolbar(); $('#typeSel').onchange = (e) => { st.type = e.target.value; render(); }; $('#topNew').onclick = () => cue.win.startSession('__new');
    if ($('#xban')) $('#xban').onclick = () => { st.banner = false; render(); };
    if ($('#mockGo')) $('#mockGo').onclick = () => { page = 'mock'; render(); };
    $('#bd').onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.start) cue.win.startSession(t.dataset.start);
      if (t.dataset.del && confirm('Delete this session?')) { await cue.sessions.remove(t.dataset.del); render(); }
      if (t.dataset.open) { st.sid = t.dataset.open; st.view = 'session'; page = 'session'; render(); }
    };
  }

  // ---------------- Resumes / Documents ----------------
  async function pFiles(kind) {
    const all = (await cue.docs.list()).filter((d) => d.kind === kind);
    const rows = filterSort(all.filter((d) => st.tab === 'all' || (st.tab === 'uploaded' ? d.source === 'uploaded' : d.source === 'maker')), (d) => d.name, (d) => d.addedAt);
    const card = (d) => `<div class="dcard doc"><div class="eyebrow">${fmtDate(d.addedAt)}</div><div class="nm">${esc(d.name)}</div><button class="dots" data-del="${d.id}" title="Delete">${ic('trash-2', 15)}</button>
      <div class="tags"><span class="pill ${d.source === 'maker' ? 'accent' : ''}">${d.source === 'maker' ? `${ic('wand-sparkles', 12)}Resume Maker` : `${ic('upload', 12)}Uploaded`}</span></div><div class="meta"><span class="mute grow" style="font-size:12.5px">${esc(d.ext || 'TXT')} · ${fmtKB(d.size || d.chars)}</span><button class="btn ghost sm" data-prev="${d.id}">${ic('eye', 14)}Preview</button></div></div>`;
    const word = kind === 'resume' ? 'Resumes' : 'Documents';
    frame(word, kind === 'resume' ? 'Upload a PDF or build a resume in the Resume Maker to personalize AI answers.' : 'Upload reference documents (notes, project docs, cheat sheets) to ground AI answers.',
      tabs(kind === 'resume' ? [['all', 'All'], ['uploaded', 'Uploaded'], ['maker', 'Resume Maker']] : [['all', 'All']]) + toolbar(kind === 'resume' ? 'Search CVs or resumes' : 'Search documents', `<span class="mute" style="margin-right:8px">${all.length} ${word.toLowerCase()}</span>`) +
      (rows.length ? `<div class="grid ${st.layout}">${rows.map(card).join('')}</div>` : `<div class="empty">${ic(kind === 'resume' ? 'file-user' : 'folders', 28)}<b style="color:var(--text)">Nothing here yet</b>Use the button at the top right to add one.</div>`),
      `<button class="btn primary" id="add">${ic('plus', 16)}${kind === 'resume' ? 'Add Resume' : 'Add Document'}</button>`);
    bindTabs(); bindToolbar();
    $('#add').onclick = async () => { const r = await cue.docs.importFiles(kind); r.filter((x) => x.error).forEach((x) => toast(x.error, 5000)); render(); };
    $('#bd').onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.del && confirm('Delete this file?')) { await cue.docs.remove(t.dataset.del); render(); }
      if (t.dataset.prev) textModal('Preview', (await cue.docs.preview(t.dataset.prev)).slice(0, 30000));
    };
  }

  // ---------------- Prepare: Question Bank ----------------
  async function pQuestions() {
    const sess = (await cue.sessions.list()).filter((s) => s.type !== 'regular');
    frame('Question Bank', 'Likely interview questions with answers drafted from your resume.',
      `<div class="row"><select id="sel" style="max-width:420px">${sess.map((s) => `<option value="${s.id}">${esc(clean(s.company || s.title))} — ${esc(clean(s.role))}</option>`).join('') || '<option value="">Create an interview session first</option>'}</select><button class="btn primary" id="gen" ${sess.length ? '' : 'disabled'}>${ic('sparkles', 15)}Generate questions</button></div><div class="qb" id="out"></div>`);
    $('#gen').onclick = async () => {
      const s = await cue.sessions.get($('#sel').value); if (!s) return; const out = $('#out'); out.innerHTML = `<p class="mute">${ic('loader-circle', 15, 'spin')} Generating…</p>`; $('#gen').disabled = true;
      try {
        const resume = s.resumeId ? (await cue.docs.preview(s.resumeId)).slice(0, 12000) : '';
        const raw = await cue.llm.complete({ model: s.model, system: 'You are an interview coach. Reply with ONLY a JSON array of 12 objects {"category":"","question":"","answer":""}. Answers are in the candidate\'s first-person voice, grounded in the resume; never invent facts that are not in it.',
          user: `Company: ${s.company}\nRole: ${s.role}\nJob description:\n${s.jobDescription}\n\nResume:\n${resume}` });
        const m = raw.match(/\[[\s\S]*\]/); const items = JSON.parse(m[0]);
        out.innerHTML = items.map((i) => `<div class="qcard"><span class="pill accent">${esc(i.category)}</span><b>${esc(i.question)}</b><div>${esc(i.answer)}</div></div>`).join('');
      } catch (e) { out.innerHTML = `<p style="color:var(--bad)">${esc(e.message)}</p>`; }
      $('#gen').disabled = false;
    };
  }

  // ---------------- Prepare: Mock Interview ----------------
  async function pMock() {
    const sess = (await cue.sessions.list()).filter((s) => s.type === 'interview');
    frame('Audio Rehearsal', 'An AI interviewer asks questions out loud while Cue drafts your answers beside you.',
      `<div class="banner"><div class="eyebrow">Practice</div><h2>Rehearse before the real one.</h2><p>Pick an interview session to base the mock on. ${BRAND.name} opens the live widget; press <b>Next question</b> and the AI interviewer asks it out loud. Answer into your microphone, then press Answer to compare with ${BRAND.name}'s draft.</p>
      <div class="row"><select id="sel" style="max-width:420px">${sess.map((s) => `<option value="${s.id}">${esc(clean(s.company || s.title))} — ${esc(clean(s.role))}</option>`).join('') || '<option value="">Create an interview session first</option>'}</select><button class="btn primary" id="go" ${sess.length ? '' : 'disabled'}>${ic('mic', 15)}Start mock interview</button></div></div>`);
    $('#go').onclick = async () => {
      const b = await cue.sessions.get($('#sel').value);
      const m = await cue.sessions.create({ type: 'mock', title: `Mock · ${clean(b.company)}`, company: b.company, role: b.role, jobDescription: b.jobDescription, resumeId: b.resumeId, docIds: b.docIds, language: b.language, model: b.model, prefs: b.prefs, notes: b.notes, saveTranscript: true });
      cue.win.startSession(m.id); toast('Opening the widget…');
    };
  }

  // ---------------- Prepare: Resume Maker ----------------
  async function pMaker() {
    const docs = await cue.docs.list(); const resumes = docs.filter((d) => d.kind === 'resume'); const sess = (await cue.sessions.list()).filter((s) => s.type !== 'regular');
    frame('Resume Maker', 'Tailor a resume to a role. Your facts stay intact — only wording and order change.',
      `<div class="row" style="align-items:flex-start"><div class="grow"><label class="lbl" style="margin-top:0">Base resume</label><select id="base">${resumes.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('') || '<option value="">Upload a resume first</option>'}</select></div>
      <div class="grow"><label class="lbl" style="margin-top:0">Target role (from a session) <small>(optional)</small></label><select id="tgt"><option value="">— paste below —</option>${sess.map((s) => `<option value="${s.id}">${esc(clean(s.company || s.title))} — ${esc(clean(s.role))}</option>`).join('')}</select></div></div>
      <label class="lbl">Job description</label><textarea id="jd" placeholder="Paste the job description…"></textarea><div class="gap"></div><button class="btn primary" id="mk" ${resumes.length ? '' : 'disabled'}>${ic('wand-sparkles', 15)}Generate tailored resume</button>
      <div id="res" style="display:none"><label class="lbl">Result (editable)</label><textarea id="txt" style="min-height:380px"></textarea><div class="row" style="margin-top:10px"><input id="nm" placeholder="Resume name" /><button class="btn primary" id="sv" style="flex:none">Save to Resumes</button></div></div>`);
    $('#tgt').onchange = async () => { const s = $('#tgt').value && (await cue.sessions.get($('#tgt').value)); if (s) $('#jd').value = s.jobDescription || ''; };
    $('#mk').onclick = async () => {
      const jd = $('#jd').value.trim(); if (!jd) return toast('Add a job description'); $('#mk').disabled = true; $('#mk').textContent = 'Generating…';
      try {
        const base = await cue.docs.preview($('#base').value);
        const out = await cue.llm.complete({ system: 'You tailor resumes. Use ONLY facts present in the base resume: you may reorder, tighten and mirror the job description\'s keywords, but never invent employers, titles, dates, degrees or metrics. Output plain text.', user: `Job description:\n${jd}\n\nBase resume:\n${base}` });
        $('#res').style.display = 'block'; $('#txt').value = out.trim(); $('#nm').value = 'Tailored resume ' + new Date().toLocaleDateString();
      } catch (e) { toast(e.message, 5000); }
      $('#mk').disabled = false; $('#mk').innerHTML = `${ic('wand-sparkles', 15)}Generate tailored resume`;
    };
    $('#sv').onclick = async () => { await cue.docs.addText('resume', $('#nm').value || 'Tailored resume', $('#txt').value, 'maker'); toast('Saved to Resumes'); page = 'resumes'; render(); };
  }

  // ---------------- Session Video (local recording -> 1 fps frames) ----------------
  // Job state lives here, outside render(): render() rebuilds the whole page, so anything stored in the DOM would be lost.
  // Each job: { jobId, name, status: running|done|failed|cancelled|cleared, percent|null, frames, dir, count, error, startedAt }
  const vjobs = [];
  let picking = false, ffmpegOk = null; // ffmpegOk: null = not checked yet
  const vjob = (id) => vjobs.find((j) => j.jobId === id);
  const vname = (p) => String(p).split(/[\\/]/).pop();
  const refreshVideo = () => { if (page === 'video') render(); };

  // Progress events fire about twice a second. Update the one card in place instead of re-rendering the page.
  cue.video.onProgress((p) => {
    const j = p && vjob(p.jobId);
    if (!j || j.status !== 'running') return; // unknown job, or a late event after cancel/finish
    j.frames = Number.isFinite(p.frames) ? p.frames : j.frames;
    j.percent = Number.isFinite(p.percent) ? Math.max(0, Math.min(100, Math.round(p.percent))) : null; // null = ffprobe unavailable, so no total duration
    vpaint(j);
  });

  function vsub(j) {
    const n = (k) => `${k} frame${k === 1 ? '' : 's'}`;
    if (j.status === 'running') return `${ic('loader-circle', 13, 'spin')} Extracting frames… ${j.percent != null ? j.percent + '% · ' : ''}${n(j.frames)}`;
    if (j.status === 'done') return `${n(j.count)} at 1 per second`;
    if (j.status === 'cleared') return 'Frames deleted';
    if (j.status === 'cancelled') return 'Cancelled';
    return 'Could not process this video';
  }
  function vcard(j) {
    const run = j.status === 'running', id = esc(j.jobId);
    const pill = { running: `<span class="pill accent">${ic('loader-circle', 12, 'spin')}Processing</span>`, done: `<span class="pill ok">${ic('circle-check', 12)}Complete</span>`,
      failed: `<span class="pill" style="color:var(--bad)">${ic('circle-alert', 12)}Failed</span>`, cancelled: '<span class="pill">Cancelled</span>', cleared: '<span class="pill">Frames deleted</span>' }[j.status];
    return `<div class="dcard vjob ${j.status}" data-job="${id}"><div class="eyebrow">${fmtDate(j.startedAt)}</div><div class="nm">${esc(j.name)}</div><div class="sub" data-sub>${vsub(j)}</div>
      ${run ? `<div class="bar"><i data-bar class="${j.percent == null ? 'ind' : ''}" ${j.percent == null ? '' : `style="width:${j.percent}%"`}></i></div>` : ''}
      ${j.status === 'done' ? `<div class="vdir">${ic('folder-open', 15)}<span class="grow">${esc(j.dir)}</span><button class="ib" data-act="copy" data-job="${id}" title="Copy folder path">${ic('copy', 14)}</button></div>` : ''}
      ${j.status === 'failed' ? `<div class="err">${esc(j.error)}</div>` : ''}
      <div class="tags">${pill}</div>
      <div class="meta"><div class="grow"></div>${run ? `<button class="btn ghost sm" data-act="cancel" data-job="${id}">${ic('square', 13)}Cancel</button>` : `<button class="btn ghost sm" data-act="dismiss" data-job="${id}" title="Remove from this list (frames stay on disk)">Dismiss</button>`}</div></div>`;
  }
  function vpaint(j) {
    const card = $$('.vjob').find((c) => c.dataset.job === j.jobId); if (!card) return; // not on this page right now; state is already updated
    $('[data-sub]', card).innerHTML = vsub(j);
    const bar = $('[data-bar]', card);
    if (bar && j.percent != null) { bar.classList.remove('ind'); bar.style.width = j.percent + '%'; }
  }
  function vpaintFF() {
    const note = $('#vnote'), go = $('#vgo'); if (!note) return;
    note.innerHTML = ffmpegOk === false ? `<div class="note warn">${ic('circle-alert', 16)}<div><b>ffmpeg isn't installed.</b> Install it (macOS: <code>brew install ffmpeg</code>) and reopen this page. To use a specific build, set the <code>CUE_FFMPEG</code> environment variable to its full path.</div></div>` : '';
    if (go) go.disabled = ffmpegOk === false;
  }

  async function vAnalyze() {
    if (picking) return; picking = true; // guards the dialog only, so several videos can run at once (the backend allows 2)
    let p; try { p = await cue.video.pick(); } catch (e) { p = { ok: false, error: e.message }; } finally { picking = false; }
    if (!p.ok) return toast(p.error, 5000);
    if (p.path) vRun(p.path); // p.path is null when the dialog was dismissed
  }
  async function vRun(filePath) {
    const { jobId, done } = cue.video.extract(filePath); // jobId comes back immediately so the card can offer Cancel
    const job = { jobId, name: vname(filePath), status: 'running', percent: null, frames: 0, startedAt: Date.now() };
    vjobs.unshift(job); refreshVideo();
    let r; try { r = await done; } catch (e) { r = { ok: false, error: e.message }; }
    if (r && r.ok) { Object.assign(job, { status: 'done', dir: r.dir, count: r.count, percent: 100 }); toast(`Done — ${r.count} frames saved`, 4000); }
    else if (r && r.cancelled) job.status = 'cancelled';
    else { Object.assign(job, { status: 'failed', error: (r && r.error) || 'Unknown error' }); toast('Video processing failed: ' + job.error, 6000); }
    refreshVideo();
  }

  function pVideo() {
    frame('Session Video', 'Turn a local recording into one image per second, ready for analysis.',
      `<div id="vnote"></div><div class="row" style="margin-bottom:14px"><span class="mute grow" style="font-size:12.5px">Frames are saved on this computer until you clear them.</span><button class="btn ghost sm" id="vclear">${ic('trash-2', 14)}Clear extracted frames</button></div>` +
      (vjobs.length ? `<div class="grid ${st.layout}">${vjobs.map(vcard).join('')}</div>` : `<div class="empty">${ic('layers', 28)}<b style="color:var(--text)">No recordings processed yet</b>Choose “Analyze Session Video” to pick a video file.</div>`),
      `<button class="btn primary" id="vgo">${ic('upload', 16)}Analyze Session Video</button>`);
    vpaintFF(); // instant, from the last known answer…
    cue.video.check().then((r) => { ffmpegOk = !!(r && r.ok && r.ffmpeg); vpaintFF(); }).catch(() => {}); // …then refreshed
    $('#vgo').onclick = vAnalyze;
    $('#vclear').onclick = async () => {
      if (!confirm('Delete all extracted frames? Running jobs will be cancelled.')) return;
      const r = await cue.video.clearCache();
      if (!r.ok) return toast('Could not clear frames: ' + r.error, 5000);
      vjobs.forEach((j) => { if (j.status === 'done') j.status = 'cleared'; });
      toast('Extracted frames deleted'); refreshVideo();
    };
    $('#bd').onclick = async (e) => {
      const t = e.target.closest('button[data-act]'); if (!t) return;
      const j = vjob(t.dataset.job); if (!j) return;
      if (t.dataset.act === 'cancel') { t.disabled = true; await cue.video.cancel(j.jobId); } // vRun() sees the cancelled result and updates the card
      if (t.dataset.act === 'copy' && j.dir) { try { await navigator.clipboard.writeText(j.dir); toast('Folder path copied'); } catch { toast('Could not copy the path', 4000); } }
      if (t.dataset.act === 'dismiss' && j.status !== 'running') { vjobs.splice(vjobs.indexOf(j), 1); refreshVideo(); }
    };
  }

  // ---------------- settings modal ----------------
  async function settingsModal() {
    const S = await cue.settings.get();
    modal(`<div class="row"><b class="grow" style="font-size:17px;letter-spacing:-.02em">Setup &amp; Settings</b><button class="ib" data-x>${ic('x', 16)}</button></div><p class="mute" style="margin:4px 0 14px">Pick your AI engines.</p>${settingsFormHTML(S)}
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" id="save">Save</button></div>`, (b, close) => {
      $('[data-x]', b).onclick = close; const saveForm = bindSettingsForm(b, S);
      $('#save', b).onclick = async () => { await saveForm(); toast('Saved'); close(); };
    });
  }


  // ---------------- Session detail (recording, metadata, summary, Q&A, transcript, review checklist) ----------------
  const REVIEW_ROWS = [['intro', 'Opening & introduction'], ['tech', 'Technical answers'], ['beh', 'Behavioral stories (STAR)'], ['comm', 'Clarity & pacing'], ['ask', 'Questions I asked them'], ['close', 'Closing & follow-up']];
  const REVIEW_COLS = [['good', 'Went well'], ['work', 'Needs work'], ['follow', 'Follow up']];
  const qaPairs = (msgs) => { const out = []; for (const m of msgs || []) { if (m.role === 'user') out.push({ q: m.content, a: '' }); else if (out.length) out[out.length - 1].a += m.content; } return out; };
  async function pDetail() {
    const s = await cue.sessions.get(st.sid); if (!s) { page = 'sessions'; return render(); }
    const regular = s.type === 'regular', name = clean(regular ? s.title || 'Call' : s.company || s.title || 'Interview');
    const box = (l, v) => `<div class="mbox"><small>${l}</small><b title="${esc(v || '')}">${esc(v || '—')}</b></div>`;
    const lines = s.transcript || [], pairs = qaPairs(s.messages), review = s.review || {};
    const meta = box('Company', clean(s.company)) + box('Role', clean(s.role)) + box('Type', { interview: 'Interview', regular: 'Regular', mock: 'Mock' }[s.type] || s.type) + box('Date', fmtDate(s.createdAt)) + box('Time used', s.usageMs ? fmtDur(s.usageMs) : '') + box('Language', CATALOG.languageName(s.language));
    const sessionView = `<div class="dsum"><div class="row"><b class="grow">${ic('sparkles', 15)} Summary</b><button class="btn sm" id="gen" ${lines.length ? '' : 'disabled title="No transcript was saved for this session"'}>${s.summary ? 'Regenerate' : 'Generate summary'}</button></div>
        <div class="sumtext">${s.summary ? md(s.summary) : `<span class="mute">${lines.length ? 'No summary yet — generate one from the saved transcript.' : 'No transcript was saved, so there is nothing to summarize.'}</span>`}</div></div>
      <h3 class="dh">Questions &amp; answers <span class="cnt">${pairs.length}</span></h3>
      ${pairs.map((p, i) => `<details class="qa" ${i === 0 ? 'open' : ''}><summary>${esc(clean(p.q).replace(/^Answer this question that was just asked in the conversation:\s*/i, '').slice(0, 160) || 'Question')}</summary><div class="qa-a">${md(p.a || '…')}</div></details>`).join('') || '<div class="empty" style="padding:22px">No answers were generated in this session.</div>'}
      <h3 class="dh">Review checklist <span class="cnt" id="rvCnt"></span><button class="lnk" id="rvReset" style="margin-left:auto">Reset</button></h3>
      <table class="chkmx"><thead><tr><th scope="col">Area</th>${REVIEW_COLS.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead><tbody>${REVIEW_ROWS.map(([r, l]) => `<tr><th scope="row">${l}</th>${REVIEW_COLS.map(([c, cl]) => `<td><input type="radio" name="rv_${r}" value="${c}" data-r="${r}" aria-label="${esc(l)}: ${cl}" ${review[r] === c ? 'checked' : ''} /></td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const transcriptView = `<div class="row" style="margin-bottom:10px"><b class="grow">${ic('file-text', 15)} Transcript <span class="cnt">${lines.length} lines</span></b><button class="btn ghost sm" id="cpTx" ${lines.length ? '' : 'disabled'}>${ic('copy', 14)}Copy</button></div>
      <div class="txlog">${lines.map((l) => `<div class="tline"><b>${esc(l.speaker)}</b><span>${esc(l.text)}</span></div>`).join('') || '<div class="empty" style="padding:22px">No transcript was saved for this session. Turn on Save Transcript when you create it.</div>'}</div>`;
    frame(esc(name), esc(regular ? clean(s.description) : clean(s.role)) || '&nbsp;',
      `<div id="recHost"></div><div class="mgridd">${meta}</div>
      <div class="vtoggle" role="tablist" aria-label="Session view"><button role="tab" data-v="session" aria-selected="${st.view === 'session'}" class="${st.view === 'session' ? 'on' : ''}">View Session</button><button role="tab" data-v="transcript" aria-selected="${st.view === 'transcript'}" class="${st.view === 'transcript' ? 'on' : ''}">View Transcript</button></div>
      <div id="dview">${st.view === 'transcript' ? transcriptView : sessionView}</div>`,
      `<button class="btn ghost" id="backList">${ic('arrow-left', 15)}All sessions</button><button class="btn primary" id="startIt" style="margin-left:8px">${ic('play', 14)}${s.status === 'ended' ? 'Restart' : 'Start Session'}</button>`);
    waveCtl = WAVE.mountWaveCard($('#recHost'), { ic, esc });
    $('#backList').onclick = () => { page = 'sessions'; render(); }; $('#startIt').onclick = () => cue.win.startSession(s.id);
    // Switching views swaps only #dview, so a recording loaded in the card above keeps playing.
    const bindView = () => {
      if (st.view === 'transcript') { $('#cpTx').onclick = () => { navigator.clipboard.writeText(lines.map((l) => `${l.speaker}: ${l.text}`).join('\n')); toast('Copied', 1200); }; return; }
      $('#gen').onclick = async () => { const b = $('#gen'); b.disabled = true; b.textContent = 'Summarizing…'; try { await cue.llm.summarize(s.id); render(); } catch (e) { toast(e.message, 5000); b.disabled = false; b.textContent = 'Generate summary'; } };
      const paintRv = () => { $('#rvCnt').textContent = `${Object.keys(review).length} of ${REVIEW_ROWS.length} reviewed`; };
      $('.chkmx').onchange = async (e) => { const r = e.target.dataset.r; if (!r) return; review[r] = e.target.value; paintRv(); await cue.sessions.update(s.id, { review: { ...review } }); };
      $('#rvReset').onclick = async () => { Object.keys(review).forEach((k) => delete review[k]); $$('.chkmx input').forEach((i) => (i.checked = false)); paintRv(); await cue.sessions.update(s.id, { review: {} }); };
      paintRv();
    };
    $$('.vtoggle button').forEach((b) => (b.onclick = () => {
      st.view = b.dataset.v; $('#dview').innerHTML = st.view === 'transcript' ? transcriptView : sessionView;
      $$('.vtoggle button').forEach((x) => { const on = x.dataset.v === st.view; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); }); bindView();
    }));
    bindView();
  }

  function render() { if (waveCtl) { waveCtl.destroy(); waveCtl = null; } ({ sessions: pSessions, session: pDetail, resumes: () => pFiles('resume'), documents: () => pFiles('document'), video: pVideo, questions: pQuestions, mock: pMock, maker: pMaker }[page] || pSessions)(); }
  render();
})();
