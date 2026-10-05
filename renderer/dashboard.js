if (MODE === 'dashboard') (() => {
  let page = new URLSearchParams(location.search).get('page') || 'sessions';
  const st = { tab: 'all', q: '', sort: 'new', layout: 'grid', banner: true };
  cue.onDashNav((p) => { page = p; render(); });
  cue.settings.get().then((s) => applyTheme(s.theme || 'dark'));

  const NAV = [['sessions', 'audio-lines', 'Call Sessions'], ['resumes', 'file-user', 'Resumes'], ['documents', 'folders', 'Documents']];
  const PREP = [['questions', 'book-open', 'Question Bank'], ['mock', 'mic', 'Mock Interview'], ['maker', 'wand-sparkles', 'Resume Maker']];
  const link = ([id, icon, label]) => `<a data-p="${id}" class="${page === id ? 'on' : ''}">${ic(icon, 16)}${label}</a>`;

  function frame(title, sub, body, action = '') {
    app.innerHTML = `<div class="dash view"><aside class="sb"><div class="brand">${brandHTML()}</div><button class="btn primary" id="newSess">${ic('plus', 16)}Create Session</button>
      <div class="grp">Call Assistant</div><div class="nav">${NAV.map(link).join('')}</div><div class="grp">Prepare</div><div class="nav">${PREP.map(link).join('')}</div>
      <div class="foot"><b>${ic('shield-check', 15)}Free &amp; private</b>Runs on your computer. Unlimited sessions, and nothing leaves this machine unless you add a cloud key.<div class="gap"></div><button class="btn ghost sm" id="gear">${ic('settings', 14)}Setup &amp; Settings</button></div></aside>
      <section class="mainc"><div class="pagehd"><div class="grow"><h1>${title}</h1><p>${sub}</p></div>${action}</div><div class="pagebd" id="bd">${body}</div></section></div>`;
    $$('.nav a').forEach((a) => (a.onclick = () => { page = a.dataset.p; st.tab = 'all'; st.q = ''; render(); }));
    $('#newSess').onclick = () => cue.win.startSession('__new');
    $('#gear').onclick = settingsModal;
  }

  const filterSort = (rows, nameOf, dateOf) => {
    const q = st.q.toLowerCase();
    rows = rows.filter((r) => !q || nameOf(r).toLowerCase().includes(q));
    return rows.sort((a, b) => (st.sort === 'new' ? dateOf(b) - dateOf(a) : st.sort === 'old' ? dateOf(a) - dateOf(b) : nameOf(a).localeCompare(nameOf(b))));
  };
  const toolbar = (ph, extra = '') => `<div class="tools"><div class="sbox">${ic('search', 15)}<input id="q" placeholder="${ph}" value="${esc(st.q)}" /></div><button class="ib boxed" id="sort" title="Sort" style="width:38px;height:38px">${ic('arrow-up-down', 16)}</button><div class="grow"></div>${extra}<button class="ib boxed" id="lay" title="Toggle layout" style="width:38px;height:38px">${ic(st.layout === 'grid' ? 'list' : 'layout-grid', 16)}</button></div>`;
  const bindToolbar = () => {
    $('#q').oninput = (e) => { st.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
    $('#sort').onclick = () => { st.sort = { new: 'old', old: 'az', az: 'new' }[st.sort]; toast('Sorted: ' + { new: 'newest first', old: 'oldest first', az: 'A–Z' }[st.sort], 1200); render(); };
    $('#lay').onclick = () => { st.layout = st.layout === 'grid' ? 'list' : 'grid'; render(); };
  };
  const tabs = (list) => `<div class="tabsb">${list.map(([id, l]) => `<button data-t="${id}" class="${st.tab === id ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const bindTabs = () => $$('.tabsb button').forEach((b) => (b.onclick = () => { st.tab = b.dataset.t; render(); }));

  // ---------------- Call Sessions ----------------
  async function pSessions() {
    const all = await cue.sessions.list();
    const rows = filterSort(all.filter((s) => st.tab === 'all' || s.type === st.tab), (s) => [s.company, s.role, s.title, s.description].join(' '), (s) => s.createdAt);
    const active = rows.filter((s) => s.status !== 'ended'), past = rows.filter((s) => s.status === 'ended');
    const kind = (s) => (s.type === 'regular' ? `${ic('phone', 12)}Regular` : s.type === 'mock' ? `${ic('mic', 12)}Mock` : `${ic('briefcase-business', 12)}Interview`);
    const card = (s) => {
      const regular = s.type === 'regular', ended = s.status === 'ended';
      return `<div class="dcard"><div class="eyebrow">${fmtDate(s.createdAt)}</div><div class="nm">${esc(clean(regular ? s.title || 'Call' : s.company || s.title))}</div><div class="sub">${esc(clean(regular ? s.description : s.role)) || '&nbsp;'}</div>
        <button class="dots" data-del="${s.id}" title="Delete session">${ic('trash-2', 15)}</button><div class="tags"><span class="pill">${kind(s)}</span>${s.saveTranscript ? `<span class="pill">${ic('file-text', 12)}Transcript</span>` : ''}</div>
        <div class="meta"><div class="grow"><div class="stat"><i class="${ended ? 'end' : ''}"></i>${ended ? 'Ended' : 'Ready to start'}</div><div class="mute" style="font-size:12px">${s.usageMs ? fmtDur(s.usageMs) : 'No usage yet'}</div></div>
        ${ended ? `<button class="btn ghost sm" data-tr="${s.id}">View Transcript</button>` : ''}<button class="btn sm ${ended ? '' : 'primary'}" data-start="${s.id}">${ic('play', 13)}${ended ? 'Restart' : 'Start Session'}</button></div></div>`;
    };
    const group = (name, arr) => `<div class="gh">${ic('chevron-down', 15)}${name} <span>${arr.length}</span></div><div class="grid ${st.layout}">${arr.map(card).join('') || `<div class="empty">${ic('sparkles', 28)}Nothing here yet.</div>`}</div>`;
    frame('Call Sessions', 'Prepare for calls and review past sessions.',
      (st.banner ? `<div class="banner"><button class="ib" id="xban" style="position:absolute;right:14px;top:14px" title="Dismiss">${ic('x', 16)}</button><div class="eyebrow">Mock interview</div><h2>Rehearse the interview before the real one.</h2><p>An AI interviewer asks the questions out loud while ${BRAND.name} drafts your answers beside you — exactly as it will on the day.</p><button class="btn primary" id="mockGo">${ic('mic', 15)}Start a mock interview</button></div>` : '') +
      tabs([['all', 'All'], ['interview', 'Interview'], ['regular', 'Regular'], ['mock', 'Mock']]) + toolbar('Search by role or company') + group('Active', active) + group('Past', past),
      `<button class="btn primary" id="topNew">${ic('plus', 16)}Create Session</button>`);
    bindTabs(); bindToolbar(); $('#topNew').onclick = () => cue.win.startSession('__new');
    if ($('#xban')) $('#xban').onclick = () => { st.banner = false; render(); };
    if ($('#mockGo')) $('#mockGo').onclick = () => { page = 'mock'; render(); };
    $('#bd').onclick = async (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.start) cue.win.startSession(t.dataset.start);
      if (t.dataset.del && confirm('Delete this session?')) { await cue.sessions.remove(t.dataset.del); render(); }
      if (t.dataset.tr) {
        const s = await cue.sessions.get(t.dataset.tr);
        const tx = (s.transcript || []).map((l) => `${l.speaker}: ${l.text}`).join('\n') || '(no transcript saved)';
        const qa = (s.messages || []).map((m) => (m.role === 'user' ? '\nQ: ' : 'A: ') + m.content).join('\n');
        textModal(clean(s.company || s.title) + ' — transcript', `${tx}\n\n──── Answers ────${qa || '\n(none)'}${s.summary ? '\n\n──── Summary ────\n' + s.summary : ''}`);
      }
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
    frame('Mock Interview', 'An AI interviewer asks questions out loud while Cue drafts your answers beside you.',
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

  // ---------------- settings modal ----------------
  async function settingsModal() {
    const S = await cue.settings.get();
    modal(`<div class="row"><b class="grow" style="font-size:17px;letter-spacing:-.02em">Setup &amp; Settings</b><button class="ib" data-x>${ic('x', 16)}</button></div><p class="mute" style="margin:4px 0 14px">${BRAND.name} runs fully on your computer for free. Cloud engines are optional.</p><div id="chk"></div>
      <details class="adv"><summary>${ic('cloud', 16)}Cloud engines (optional)${ic('chevron-down', 16)}</summary><div>
        <label class="lbl">Anthropic API key</label><input id="anthropicKey" type="password" value="${esc(S.anthropicKey)}" placeholder="sk-ant-…" />
        <label class="lbl">Deepgram API key</label><input id="deepgramKey" type="password" value="${esc(S.deepgramKey)}" />
        <label class="lbl">Speech recognition engine</label><select id="stt"><option value="local">Local Whisper (free)</option><option value="deepgram">Deepgram (cloud, needs key)</option></select></div></details>
      <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn primary" id="save">Save</button></div>`, (b, close) => {
      $('[data-x]', b).onclick = close; $('#stt', b).value = S.stt || 'local'; setupPanel($('#chk', b), S.language);
      $('#save', b).onclick = async () => { const patch = {}; ['anthropicKey', 'deepgramKey', 'stt'].forEach((k) => (patch[k] = $('#' + k, b).value)); await cue.settings.set(patch); toast('Saved'); close(); };
    });
  }

  function render() { ({ sessions: pSessions, resumes: () => pFiles('resume'), documents: () => pFiles('document'), questions: pQuestions, mock: pMock, maker: pMaker }[page] || pSessions)(); }
  render();
})();
