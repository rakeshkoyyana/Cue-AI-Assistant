if (MODE === 'dashboard') (() => {
  let page = new URLSearchParams(location.search).get('page') || 'sessions';
  const st = { tab: 'all', q: '', sort: 'new', layout: 'grid', banner: true };
  cue.onDashNav((p) => { page = p; render(); });

  const NAV = [['sessions', '🎙', 'Call Sessions'], ['resumes', '📄', 'Resumes'], ['documents', '🗂', 'Documents']];
  const PREP = [['questions', '📖', 'Question Bank'], ['mock', '💼', 'Mock Interview'], ['maker', '✎', 'Resume Maker']];
  const link = ([id, ic, label]) => `<a data-p="${id}" class="${page === id ? 'on' : ''}"><span>${ic}</span>${label}</a>`;

  function frame(title, sub, body, action = '') {
    app.innerHTML = `<div class="dash"><aside class="sb"><div class="brand"><span class="logo"></span>Cue</div><button class="btn green" id="newSess">＋ Create Session</button>
      <div class="grp">Call Assistant</div><div class="nav">${NAV.map(link).join('')}</div><div class="grp">Prepare</div><div class="nav">${PREP.map(link).join('')}</div>
      <div class="foot" style="margin-top:auto"><b>Self-hosted</b><br>Unlimited usage · all data stays on this computer.<div class="gap"></div><button class="btn ghost sm" id="gear">⚙ Settings</button></div></aside>
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
  const toolbar = (ph, extra = '') => `<div class="tools"><input id="q" placeholder="🔍  ${ph}" value="${esc(st.q)}" /><button class="btn ghost" id="sort" title="Sort">⇅</button><div class="grow"></div>${extra}<button class="btn ghost sm" id="lay">${st.layout === 'grid' ? '☰' : '▦'}</button></div>`;
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
    const card = (s) => {
      const regular = s.type === 'regular', ended = s.status === 'ended';
      return `<div class="dcard"><div class="top"><div class="mute" style="font-size:12px">${fmtDate(s.createdAt)}</div><div class="nm">${esc(clean(regular ? s.title || 'Call' : s.company || s.title))}</div><div class="sub">${esc(clean(regular ? s.description : s.role))}</div>
        <button class="dots" data-del="${s.id}" title="Delete">⋮</button><div class="tags"><span class="pill">${regular ? '📞 Regular' : s.type === 'mock' ? '🎙 Mock' : '💼 Interview'}</span>${s.saveTranscript ? '<span class="pill">▤ Transcript</span>' : ''}</div></div>
        <div class="meta"><div class="grow"><b style="color:var(--text)">${ended ? '● Ended' : '<span style="color:var(--accent)">●</span> Ready to Start'}</b><br>${s.usageMs ? fmtDur(s.usageMs) : 'No usage yet'}</div>
        ${ended ? `<button class="btn ghost sm" data-tr="${s.id}">View Transcript</button>` : ''}<button class="btn sm" data-start="${s.id}">${ended ? 'Restart' : 'Start Session'}</button></div></div>`;
    };
    const group = (name, arr) => `<div class="gh">⌄ ${name} <span>${arr.length}</span></div><div class="grid ${st.layout}">${arr.map(card).join('') || '<div class="empty">Nothing here.</div>'}</div>`;
    frame('Call Sessions', 'Prepare for calls and review past sessions.',
      (st.banner ? `<div class="banner"><button class="btn ghost sm" id="xban" style="position:absolute;right:14px;top:14px">✕</button><small>MOCK INTERVIEW</small><h2>Rehearse the interview before the real one.</h2><p>An AI interviewer asks the questions out loud while Cue drafts your answers beside you, exactly as it will on the day.</p><button class="btn" id="mockGo">🎙 Start a mock interview</button></div>` : '') +
      tabs([['all', 'All'], ['interview', 'Interview'], ['regular', 'Regular'], ['mock', 'Mock']]) + toolbar('Search by role or company') + group('Active', active) + group('Past', past),
      '<button class="btn green" id="topNew">Create Session</button>');
    bindTabs(); bindToolbar(); $('#topNew').onclick = () => cue.win.startSession('__new');
    if ($('#xban')) $('#xban').onclick = () => { st.banner = false; render(); };
    if ($('#mockGo')) $('#mockGo').onclick = () => { page = 'mock'; render(); };
    $('#bd').onclick = async (e) => {
      const t = e.target;
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
    const card = (d) => `<div class="dcard doc"><div class="top"><div class="mute" style="font-size:12px">${fmtDate(d.addedAt)}</div><div class="nm">${esc(d.name)}</div><button class="dots" data-del="${d.id}">⋮</button>
      <div class="tags"><span class="pill">${d.source === 'maker' ? '✎ Resume Maker' : '⬆ Uploaded'}</span></div></div><div class="meta">${esc(d.ext || 'TXT')} · ${fmtKB(d.size || d.chars)}<div class="grow"></div><button class="btn ghost sm" data-prev="${d.id}">Preview</button></div></div>`;
    const word = kind === 'resume' ? 'Resumes' : 'Documents';
    frame(word, kind === 'resume' ? 'Upload a PDF or build a resume in the Resume Maker to personalize AI answers.' : 'Upload reference documents (notes, project docs, cheat sheets) to ground AI answers.',
      tabs(kind === 'resume' ? [['all', 'All'], ['uploaded', 'Uploaded'], ['maker', 'Resume Maker']] : [['all', 'All']]) + toolbar(kind === 'resume' ? 'Search CVs or resumes' : 'Search documents', `<span class="mute">${all.length} ${word}</span>`) +
      (rows.length ? `<div class="grid ${st.layout}">${rows.map(card).join('')}</div>` : `<div class="empty">Nothing here yet — use the button at the top right to add one.</div>`),
      `<button class="btn green" id="add">${kind === 'resume' ? 'Add Resume' : 'Add Document'}</button>`);
    bindTabs(); bindToolbar();
    $('#add').onclick = async () => { const r = await cue.docs.importFiles(kind); r.filter((x) => x.error).forEach((x) => toast(x.error, 5000)); render(); };
    $('#bd').onclick = async (e) => {
      const t = e.target;
      if (t.dataset.del && confirm('Delete this file?')) { await cue.docs.remove(t.dataset.del); render(); }
      if (t.dataset.prev) textModal('Preview', (await cue.docs.preview(t.dataset.prev)).slice(0, 30000));
    };
  }

  // ---------------- Prepare: Question Bank ----------------
  async function pQuestions() {
    const sess = (await cue.sessions.list()).filter((s) => s.type !== 'regular');
    frame('Question Bank', 'Likely interview questions with answers drafted from your resume.',
      `<div class="row"><select id="sel" style="max-width:420px">${sess.map((s) => `<option value="${s.id}">${esc(clean(s.company || s.title))} — ${esc(clean(s.role))}</option>`).join('') || '<option value="">Create an interview session first</option>'}</select><button class="btn" id="gen" ${sess.length ? '' : 'disabled'}>Generate questions</button></div><div class="qb" id="out"></div>`);
    $('#gen').onclick = async () => {
      const s = await cue.sessions.get($('#sel').value); if (!s) return; const out = $('#out'); out.innerHTML = '<p class="mute">Generating…</p>'; $('#gen').disabled = true;
      try {
        const resume = s.resumeId ? (await cue.docs.preview(s.resumeId)).slice(0, 12000) : '';
        const raw = await cue.llm.complete({ model: s.model, system: 'You are an interview coach. Reply with ONLY a JSON array of 12 objects {"category":"","question":"","answer":""}. Answers are in the candidate\'s first-person voice, grounded in the resume; never invent facts that are not in it.',
          user: `Company: ${s.company}\nRole: ${s.role}\nJob description:\n${s.jobDescription}\n\nResume:\n${resume}` });
        const m = raw.match(/\[[\s\S]*\]/); const items = JSON.parse(m[0]);
        out.innerHTML = items.map((i) => `<div class="qcard"><span class="pill">${esc(i.category)}</span><b style="margin-top:8px">${esc(i.question)}</b><div>${esc(i.answer)}</div></div>`).join('');
      } catch (e) { out.innerHTML = `<p style="color:var(--bad)">${esc(e.message)}</p>`; }
      $('#gen').disabled = false;
    };
  }

  // ---------------- Prepare: Mock Interview ----------------
  async function pMock() {
    const sess = (await cue.sessions.list()).filter((s) => s.type === 'interview');
    frame('Mock Interview', 'An AI interviewer asks questions out loud while Cue drafts your answers beside you.',
      `<div class="banner"><h2>Rehearse before the real one.</h2><p>Pick an interview session to base the mock on. Cue will open the live widget; press <b>Next question</b> and the AI interviewer asks it out loud. Answer into your microphone and press Answer to compare with Cue's draft.</p>
      <div class="row" style="margin-top:14px"><select id="sel" style="max-width:420px">${sess.map((s) => `<option value="${s.id}">${esc(clean(s.company || s.title))} — ${esc(clean(s.role))}</option>`).join('') || '<option value="">Create an interview session first</option>'}</select><button class="btn" id="go" ${sess.length ? '' : 'disabled'}>🎙 Start mock interview</button></div></div>`);
    $('#go').onclick = async () => {
      const b = await cue.sessions.get($('#sel').value);
      const m = await cue.sessions.create({ type: 'mock', title: `Mock · ${clean(b.company)}`, company: b.company, role: b.role, jobDescription: b.jobDescription, resumeId: b.resumeId, docIds: b.docIds, language: b.language, model: b.model, prefs: b.prefs, notes: b.notes, saveTranscript: true });
      cue.win.startSession(m.id); toast('Opening the Cue widget…');
    };
  }

  // ---------------- Prepare: Resume Maker ----------------
  async function pMaker() {
    const docs = await cue.docs.list(); const resumes = docs.filter((d) => d.kind === 'resume'); const sess = (await cue.sessions.list()).filter((s) => s.type !== 'regular');
    frame('Resume Maker', 'Tailor a resume to a role. Your facts stay intact — Cue only reorders and rewords.',
      `<div class="row" style="align-items:flex-start"><div class="grow"><label class="lbl">Base resume</label><select id="base">${resumes.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('') || '<option value="">Upload a resume first</option>'}</select></div>
      <div class="grow"><label class="lbl">Target role (from a session) <small>(Optional)</small></label><select id="tgt"><option value="">— paste below —</option>${sess.map((s) => `<option value="${s.id}">${esc(clean(s.company || s.title))} — ${esc(clean(s.role))}</option>`).join('')}</select></div></div>
      <label class="lbl">Job description</label><textarea id="jd" placeholder="Paste the job description…"></textarea><div class="gap"></div><button class="btn" id="mk" ${resumes.length ? '' : 'disabled'}>Generate tailored resume</button>
      <div id="res" style="display:none"><label class="lbl">Result (editable)</label><textarea id="txt" style="min-height:380px"></textarea><div class="row" style="margin-top:8px"><input id="nm" placeholder="Resume name" /><button class="btn green" id="sv">Save to Resumes</button></div></div>`);
    $('#tgt').onchange = async () => { const s = $('#tgt').value && (await cue.sessions.get($('#tgt').value)); if (s) $('#jd').value = s.jobDescription || ''; };
    $('#mk').onclick = async () => {
      const jd = $('#jd').value.trim(); if (!jd) return toast('Add a job description'); $('#mk').disabled = true; $('#mk').textContent = 'Generating…';
      try {
        const base = await cue.docs.preview($('#base').value);
        const out = await cue.llm.complete({ system: 'You tailor resumes. Use ONLY facts present in the base resume: you may reorder, tighten and mirror the job description\'s keywords, but never invent employers, titles, dates, degrees or metrics. Output plain text.', user: `Job description:\n${jd}\n\nBase resume:\n${base}` });
        $('#res').style.display = 'block'; $('#txt').value = out.trim(); $('#nm').value = 'Tailored resume ' + new Date().toLocaleDateString();
      } catch (e) { toast(e.message, 5000); }
      $('#mk').disabled = false; $('#mk').textContent = 'Generate tailored resume';
    };
    $('#sv').onclick = async () => { await cue.docs.addText('resume', $('#nm').value || 'Tailored resume', $('#txt').value, 'maker'); toast('Saved to Resumes'); page = 'resumes'; render(); };
  }

  // ---------------- settings modal ----------------
  async function settingsModal() {
    const S = await cue.settings.get();
    modal(`<b>Settings</b><label class="lbl">Default AI provider</label><select id="provider"><option value="anthropic">Anthropic Claude</option><option value="ollama">Local model (Ollama)</option></select>
      <label class="lbl">Anthropic API key</label><input id="anthropicKey" type="password" value="${esc(S.anthropicKey)}" /><div class="row"><div class="grow"><label class="lbl">Ollama URL</label><input id="ollamaUrl" value="${esc(S.ollamaUrl)}" /></div><div class="grow"><label class="lbl">Ollama model</label><input id="ollamaModel" value="${esc(S.ollamaModel)}" /></div></div>
      <label class="lbl">Deepgram API key</label><input id="deepgramKey" type="password" value="${esc(S.deepgramKey)}" /><div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" id="save">Save</button></div>`, (b, close) => {
      $('#provider', b).value = S.provider;
      $('#save', b).onclick = async () => { const patch = {}; ['provider', 'anthropicKey', 'ollamaUrl', 'ollamaModel', 'deepgramKey'].forEach((k) => (patch[k] = $('#' + k, b).value)); await cue.settings.set(patch); toast('Saved'); close(); };
    });
  }

  function render() { ({ sessions: pSessions, resumes: () => pFiles('resume'), documents: () => pFiles('document'), questions: pQuestions, mock: pMock, maker: pMaker }[page] || pSessions)(); }
  render();
})();
