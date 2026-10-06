// wizard.js — the two-step "Create Session" wizard (also used to edit a session). A controller with its own state;
// the widget supplies the surrounding chrome through `host`:
//   host.view(html)            replace the window contents      host.shell(inner)  wrap in the widget header/rail
//   host.bindHeader()          wire the header buttons           host.size(w, h)    resize the window
//   host.done(msg)             called after a successful save    host.cancel()      called on Cancel
// Depends on globals: CATALOG, cue, ic, esc, md, modal, toast, clean, modelList, $, $$.
function createWizard(host) {
  const C = CATALOG;
  const TYPES = [['interview', 'briefcase-business', 'Interview'], ['regular', 'phone', 'Regular'], ['mock', 'mic', 'Mock']];
  let S = {}, draft = null, step = 1, editId = null, docs = [], recent = [], previewCat = 'coding';

  const fresh = () => ({ sessionType: 'interview', company: '', role: '', jobDescription: '', title: '', description: '', resumeId: '', docIds: [], folderPath: '', language: S.language || 'en', model: '',
    prefs: C.normalizePrefs(), notes: '', autoGenerate: false, saveTranscript: true });
  const fromSession = (s) => ({ sessionType: s.type || 'interview', company: s.company || '', role: s.role || '', jobDescription: s.jobDescription || '', title: s.title || '', description: s.description || '', resumeId: s.resumeId || '', docIds: [...(s.docIds || [])],
    folderPath: s.folderPath || '', language: s.language || 'en', model: s.model || '', prefs: C.normalizePrefs(s.prefs), notes: s.notes || '', autoGenerate: !!s.autoGenerate, saveTranscript: s.saveTranscript !== false });

  async function open({ session } = {}) {
    S = await cue.settings.get(); docs = await cue.docs.list(); recent = (await cue.sessions.list()).map((x) => x.company).filter(Boolean);
    editId = session ? session.id : null; draft = session ? fromSession(session) : fresh(); step = 1; previewCat = 'coding'; render();
  }
  const isJob = () => draft.sessionType !== 'regular';
  const stepper = () => `<div class="wzhead"><div class="wzstep ${step === 1 ? 'on' : 'done'}"><b>${step > 1 ? ic('check', 13) : 1}</b>Details</div><i></i><div class="wzstep ${step === 2 ? 'on' : ''}"><b>2</b>Preferences</div><span class="grow"></span><span class="wztitle">${editId ? 'Edit Session' : 'Create Session'}</span></div>`;

  function render() { step === 1 ? renderStep1() : renderStep2(); }

  // ============================================================ step 1
  function renderStep1() {
    host.size(840, 740);
    const tabs = `<div class="seg" role="tablist" aria-label="Session type">${TYPES.map(([id, icon, label]) => `<button role="tab" aria-selected="${draft.sessionType === id}" data-type="${id}" class="${draft.sessionType === id ? 'on' : ''}">${ic(icon, 15)}${label}</button>`).join('')}</div>`;
    const job = isJob() ? `<div class="inwrap" style="margin-top:14px"><input id="jobUrl" type="url" placeholder="Paste a job link" aria-label="Paste a job link" autocomplete="off" /><button class="inico" id="jobGo" aria-label="Import job details" title="Import job details">${ic('search', 16)}</button></div>
      <div class="two"><div><label class="lbl" for="company">Company</label><div class="combo"><input id="company" role="combobox" aria-expanded="false" aria-controls="clist" aria-autocomplete="list" autocomplete="off" placeholder="Search or type a company" value="${esc(draft.company)}" />
        <span class="cchev">${ic('chevron-down', 15)}</span><ul id="clist" class="clist" role="listbox" aria-label="Companies and schools" hidden></ul></div></div>
        <div><label class="lbl" for="role">Role <small>(optional)</small></label><input id="role" placeholder="e.g. Data Engineer" value="${esc(draft.role)}" /></div></div>` : '';
    const split = `<div class="split">
      <section class="pane" aria-label="Your resumes"><div class="phead"><h3>${ic('file-user', 15)}Resumes</h3><span class="mute grow" style="text-align:right">Pick one</span></div><div class="flist" id="resumes" role="radiogroup" aria-label="Resume"></div><div class="pfoot"><button class="lnk" id="addResume">${ic('plus', 14)}Add a resume</button></div></section>
      <section class="pane" aria-label="Documents"><div class="phead"><h3>${ic('folders', 15)}Documents</h3><span class="mute" id="docCount"></span><button class="lnk" id="refresh">${ic('refresh-cw', 13)}Refresh documents</button></div><div class="flist" id="docList"></div>
        <div class="pfoot"><button class="lnk" id="addDoc">${ic('plus', 14)}Add a document</button><span class="grow"></span><button class="lnk" id="selAll">Select All</button><button class="lnk" id="clr">Clear</button></div></section></div>`;
    const fields = `<div class="two"><div><label class="lbl" for="title">Call Title <small>(Optional)</small></label><textarea id="title" rows="2" class="ta" placeholder="Give this call a name">${esc(draft.title)}</textarea></div>
      <div><label class="lbl" for="desc">Description <small>(Optional)</small></label><textarea id="desc" rows="2" class="ta" placeholder="What is this call about?">${esc(draft.description)}</textarea></div></div>` +
      (isJob() ? `<label class="lbl" for="jd">Job description <small>(Optional)</small></label><textarea id="jd" rows="3" class="ta" placeholder="Paste the job description">${esc(draft.jobDescription)}</textarea>`
        : `<label class="lbl">Project folder <small>(${BRAND.name} reads the whole folder as context)</small></label><div class="row"><button class="btn ghost sm" id="pick">${ic('folder-open', 14)}Choose folder…</button><span class="mute grow" id="folderInfo" style="word-break:break-all;font-size:12px">${esc(draft.folderPath)}</span></div>`);
    host.view(host.shell(`<div class="body wz">${stepper()}<div class="wzbody">${tabs}${job}${split}${fields}</div><div class="wizfoot"><button class="btn ghost" id="cancel">Cancel</button><button class="btn primary" id="next">Next${ic('arrow-right', 15)}</button></div></div>`));
    host.bindHeader(); paintFiles(); bindStep1();
  }

  const fileRow = (d, kind) => { const on = kind === 'resume' ? draft.resumeId === d.id : draft.docIds.includes(d.id);
    return `<div class="fitem ${on ? 'on' : ''}" role="${kind === 'resume' ? 'radio' : 'checkbox'}" aria-checked="${on}" tabindex="0" data-id="${esc(d.id)}" data-kind="${kind}">${kind === 'document' ? `<input type="checkbox" tabindex="-1" ${on ? 'checked' : ''} aria-hidden="true" />` : ''}<span class="fic">${ic('file-text', 16)}</span><span class="fname" title="${esc(d.name)}">${esc(d.name)}</span><small class="mute">${d.chars ? Math.max(1, Math.round(d.chars / 1000)) + 'k chars' : ''}</small>${kind === 'resume' && on ? ic('check', 15) : ''}</div>`; };
  function paintFiles() {
    const rs = docs.filter((d) => d.kind === 'resume'), ds = docs.filter((d) => d.kind !== 'resume');
    draft.docIds = draft.docIds.filter((id) => ds.some((d) => d.id === id)); if (draft.resumeId && !rs.some((d) => d.id === draft.resumeId)) draft.resumeId = '';
    $('#resumes').innerHTML = rs.map((d) => fileRow(d, 'resume')).join('') || '<div class="fempty">No resumes yet.<br>Use “Add a resume”.</div>';
    $('#docList').innerHTML = ds.map((d) => fileRow(d, 'document')).join('') || '<div class="fempty">No documents yet.<br>Use “Add a document”.</div>';
    $('#docCount').textContent = ds.length ? `${draft.docIds.length}/${ds.length} selected` : '';
  }
  async function reloadDocs(msg) { docs = await cue.docs.list(); paintFiles(); if (msg) toast(msg, 1000); }
  async function addDocs(kind) {
    const r = await cue.docs.importFiles(kind); (r || []).filter((x) => x.error).forEach((x) => toast(x.error, 5000));
    const added = (r || []).filter((x) => x.id); added.forEach((x) => (kind === 'resume' ? (draft.resumeId = x.id) : draft.docIds.push(x.id))); await reloadDocs();
  }

  function grab1() {
    if (isJob()) { draft.company = $('#company').value; draft.role = $('#role').value; draft.jobDescription = $('#jd').value; }
    draft.title = $('#title').value; draft.description = $('#desc').value;
  }
  function bindStep1() {
    $$('.seg [data-type]').forEach((b) => (b.onclick = () => { grab1(); draft.sessionType = b.dataset.type; renderStep1(); }));
    $('#cancel').onclick = () => host.cancel();
    $('#next').onclick = () => { grab1(); step = 2; render(); };
    const sync = () => { const ok = !isJob() || $('#company').value.trim() || $('#jd').value.trim() || draft.company.trim(); $('#next').disabled = !ok; $('#next').title = ok ? '' : 'Enter a company or a job description first'; };
    // file panels
    const panes = $('.split');
    panes.onclick = (e) => { const it = e.target.closest('.fitem'); if (!it) return; pick(it); };
    panes.onkeydown = (e) => { const it = e.target.closest('.fitem'); if (it && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); pick(it); } };
    const pick = (it) => { const id = it.dataset.id; if (it.dataset.kind === 'resume') draft.resumeId = draft.resumeId === id ? '' : id; else draft.docIds = draft.docIds.includes(id) ? draft.docIds.filter((x) => x !== id) : [...draft.docIds, id]; const y = [$('#resumes').scrollTop, $('#docList').scrollTop]; paintFiles(); $('#resumes').scrollTop = y[0]; $('#docList').scrollTop = y[1]; };
    $('#refresh').onclick = () => reloadDocs('Refreshed');
    $('#addResume').onclick = () => addDocs('resume'); $('#addDoc').onclick = () => addDocs('document');
    $('#selAll').onclick = () => { draft.docIds = docs.filter((d) => d.kind !== 'resume').map((d) => d.id); paintFiles(); };
    $('#clr').onclick = () => { draft.docIds = []; paintFiles(); };
    if (!isJob()) { $('#pick').onclick = async () => { grab1(); const p = await cue.folder.pick(); if (!p) return; draft.folderPath = p; const f = await cue.folder.summary(p); renderStep1(); toast(`${f.fileCount} files loaded as context`); }; sync(); return; }
    $('#jd').oninput = sync;
    // job link
    const go = async () => {
      const url = $('#jobUrl').value.trim(); if (!url) return; if (!/^https?:\/\//i.test(url)) return toast('Paste the full link, starting with https://', 3500);
      const b = $('#jobGo'); b.disabled = true; b.innerHTML = ic('loader-circle', 16, 'spin');
      try { const j = await cue.job.import(url); grab1(); draft.company = clean(j.company); draft.role = clean(j.role); draft.jobDescription = clean(j.jobDescription); renderStep1(); toast('Imported'); }
      catch (e) { toast(e.message || 'Could not import that link', 5000); b.disabled = false; b.innerHTML = ic('search', 16); }
    };
    $('#jobGo').onclick = go; $('#jobUrl').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    bindCombo(sync); sync();
  }

  // Company combobox (ARIA 1.2 pattern: focus stays in the input, arrow keys move aria-activedescendant).
  function bindCombo(sync) {
    const input = $('#company'), ul = $('#clist'); let items = [], active = -1;
    const isOpen = () => !ul.hidden;
    const setOpen = (v) => { ul.hidden = !v; input.setAttribute('aria-expanded', String(v)); if (!v) { active = -1; input.removeAttribute('aria-activedescendant'); } };
    const paint = () => {
      ul.innerHTML = items.length ? items.map((it, i) => `<li role="option" id="co${i}" data-i="${i}" aria-selected="${i === active}" class="${i === active ? 'on' : ''}"><span class="logo" style="background:hsl(${it.hue} 52% 40%)" aria-hidden="true">${esc(it.initials)}</span><span class="cname">${it.html}</span><small>${esc(it.kind)}</small></li>`).join('')
        : `<li class="none" role="presentation">No match — “${esc(input.value.trim())}” will be used as typed</li>`;
      if (active >= 0) { input.setAttribute('aria-activedescendant', 'co' + active); const el = $('#co' + active); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
    };
    const refresh = () => { items = C.filterCompanies(input.value, recent, 40); active = input.value.trim() && items.length ? 0 : -1; paint(); setOpen(true); };
    const choose = (i) => { const it = items[i]; if (!it) return; input.value = it.name; draft.company = it.name; setOpen(false); sync(); };
    input.oninput = () => { draft.company = input.value; refresh(); sync(); };
    input.onfocus = refresh;
    input.onblur = () => setTimeout(() => setOpen(false), 120);
    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!isOpen()) return refresh(); active = Math.min(items.length - 1, active + 1); paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); paint(); }
      else if (e.key === 'Enter' && isOpen() && active >= 0) { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
    };
    ul.onmousedown = (e) => { e.preventDefault(); const li = e.target.closest('li[data-i]'); if (li) choose(Number(li.dataset.i)); }; // mousedown keeps focus in the input
    input.nextElementSibling.onmousedown = (e) => { e.preventDefault(); isOpen() ? setOpen(false) : (input.focus(), refresh()); };
  }

  // ============================================================ step 2
  const pvCats = () => C.PREVIEW_CATEGORIES;
  const prefRow = (key, icon, title, value, extra = '') => `<button class="prow rowbtn" data-open="${key}"><span class="pi">${ic(icon, 16)}</span><span class="grow"><span class="t">${title}</span><span class="s">${esc(value)}</span></span>${extra}<span class="chev">${ic('chevron-right', 16)}</span></button>`;
  const modelName = () => { if (!draft.model) return 'Default'; const m = modelList(S).find((x) => x.id === draft.model); return m ? m.label.replace(/^.*? — /, '') : draft.model; };
  const toggle = (id, on) => `<div class="toggle ${on ? 'on' : ''}" id="${id}" role="switch" aria-checked="${on}" tabindex="0"></div>`;

  function renderStep2() {
    host.size(1020, 740);
    const p = draft.prefs;
    const left = `<div class="cfg"><div class="sechd" style="margin-top:0">Session</div>
      ${prefRow('lang', 'globe', 'Select Language', C.languageName(draft.language))}
      ${prefRow('model', 'cpu', 'Select Model', modelName())}
      <div class="sechd">Answer Preferences</div>
      ${prefRow('format', 'list', 'Format', C.labelOf('format', p.format), p.star ? '<span class="pill accent">STAR</span>' : '')}
      ${prefRow('length', 'arrow-up-down', 'Length', C.labelOf('length', p.length))}
      ${prefRow('tone', 'message-square-text', 'Tone', C.labelOf('tone', p.tone))}
      <div class="sechd">Edit AI instructions</div>
      <div class="icard"><textarea id="notes" rows="4" class="ta" maxlength="4000" placeholder="Tone, things to emphasise, topics to avoid…" aria-label="AI instructions">${esc(draft.notes)}</textarea><div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost sm" id="notesClear">Clear</button><button class="btn sm" id="notesSave">Save changes</button></div></div>
      <div class="sechd">Extra</div>
      <div class="prow"><span class="pi">${ic('zap', 16)}</span><div class="grow"><div class="t">Auto Generate <span class="pill accent" style="margin-left:4px">Beta</span></div><div class="s">Answers questions automatically</div></div>${toggle('auto', draft.autoGenerate)}</div>
      <div class="prow"><span class="pi">${ic('file-text', 16)}</span><div class="grow"><div class="t">Save Transcript</div><div class="s">Stored only on this computer</div></div>${toggle('saveT', draft.saveTranscript)}</div></div>`;
    const right = `<aside class="pv" aria-label="Answer Preview"><div class="pvhead"><b>Answer Preview</b><select id="pvCat" aria-label="Question category">${pvCats().map((c) => `<option value="${c.id}" ${c.id === previewCat ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div><div class="pvbody" id="pvBody" aria-live="polite"></div><div class="pvnote" id="pvNote"></div><div class="pvfoot mute">Sample only — real answers use your resume and the live question.</div></aside>`;
    host.view(host.shell(`<div class="body wz">${stepper()}<div class="wzbody two-col">${left}${right}</div><div class="wizfoot"><button class="btn ghost" id="back">${ic('arrow-left', 15)}Back</button><button class="btn primary" id="save">${editId ? 'Save Changes' : 'Create Session'}</button></div></div>`));
    host.bindHeader(); paintPreview(); bindStep2();
  }
  function paintPreview() { const r = C.buildPreview(previewCat, draft.prefs); $('#pvBody').innerHTML = md(r.md); $('#pvNote').textContent = r.note; $('#pvNote').hidden = !r.note; }
  function updateRows() { // refresh only the value lines, so open dialogs/typing aren't disturbed
    const set = (k, v) => { const el = $(`[data-open="${k}"] .s`); if (el) el.textContent = v; };
    set('lang', C.languageName(draft.language)); set('model', modelName()); set('format', C.labelOf('format', draft.prefs.format)); set('length', C.labelOf('length', draft.prefs.length)); set('tone', C.labelOf('tone', draft.prefs.tone));
    const f = $('[data-open="format"]'); const st = f.querySelector('.pill'); if (draft.prefs.star && !st) f.querySelector('.chev').insertAdjacentHTML('beforebegin', '<span class="pill accent">STAR</span>'); else if (!draft.prefs.star && st) st.remove();
    paintPreview();
  }
  function bindStep2() {
    $('#back').onclick = () => { draft.notes = $('#notes').value; step = 1; render(); };
    $('#pvCat').onchange = (e) => { previewCat = e.target.value; paintPreview(); };
    $$('[data-open]').forEach((b) => (b.onclick = () => ({ lang: langDialog, model: modelDialog, format: () => prefDialog('format'), length: () => prefDialog('length'), tone: () => prefDialog('tone') })[b.dataset.open]()));
    const tg = (id, key) => { const el = $(id); const go = () => { draft[key] = !draft[key]; el.classList.toggle('on', draft[key]); el.setAttribute('aria-checked', String(draft[key])); }; el.onclick = go; el.onkeydown = (e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), go()); };
    tg('#auto', 'autoGenerate'); tg('#saveT', 'saveTranscript');
    $('#notesClear').onclick = () => { $('#notes').value = ''; draft.notes = ''; $('#notes').focus(); };
    $('#notesSave').onclick = () => { draft.notes = $('#notes').value; const b = $('#notesSave'); b.textContent = 'Saved ✓'; setTimeout(() => { if (b.isConnected) b.textContent = 'Save changes'; }, 1400); };
    $('#save').onclick = save;
  }

  // ---- overlays
  function overlay(html, onMount) {
    return modal(`<div class="ov">${html}</div>`, (box, close) => {
      box.parentElement.classList.add('ovm');
      const key = (e) => { if (!box.isConnected) return document.removeEventListener('keydown', key, true); if (e.key === 'Escape') { e.stopPropagation(); close(); } };
      document.addEventListener('keydown', key, true); onMount(box, () => { document.removeEventListener('keydown', key, true); close(); });
    });
  }
  function langDialog() {
    overlay(`<div class="ovhead"><b>Select Language</b><button class="ib" data-x aria-label="Close">${ic('x', 16)}</button></div><div class="sbox">${ic('search', 15)}<input id="lq" placeholder="Search language" aria-label="Search language" autocomplete="off" /></div><ul class="ovlist" id="ll" role="listbox" aria-label="Languages"></ul>`, (b, close) => {
      const paint = () => { const rows = C.filterLanguages($('#lq', b).value); $('#ll', b).innerHTML = rows.map(([c, n]) => `<li role="option" tabindex="0" data-c="${c}" aria-selected="${c === draft.language}" class="${c === draft.language ? 'on' : ''}"><span class="grow">${esc(n)}</span>${c === draft.language ? ic('check', 15) : ''}</li>`).join('') || '<li class="none" role="presentation">No languages match</li>'; };
      const pick = (li) => { if (!li || !li.dataset.c) return; draft.language = li.dataset.c; updateRows(); close(); };
      $('#lq', b).oninput = paint; paint(); $('#lq', b).focus(); $('[data-x]', b).onclick = close;
      $('#ll', b).onclick = (e) => pick(e.target.closest('li')); $('#ll', b).onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e.target.closest('li')); } };
      $('#lq', b).onkeydown = (e) => { if (e.key === 'Enter') { const li = $('#ll li[data-c]', b); if (li) pick(li); } };
    });
  }
  function modelDialog() {
    const list = modelList(S), def = list.find((m) => m.id === S.defaultModel);
    const card = (id, name, sub, tags, disabled, note) => `<button class="mcard ${draft.model === id ? 'on' : ''}" data-m="${esc(id)}" ${disabled ? 'disabled' : ''} role="radio" aria-checked="${draft.model === id}"><span class="grow"><b>${esc(name)}</b><small class="mute">${esc(sub)}</small>${note ? `<small class="warnt">${esc(note)}</small>` : ''}<span class="tags">${tags.map((t) => `<span class="pill ${/free|best/i.test(t) ? 'ok' : t === 'Most accurate' ? 'accent' : ''}">${esc(t)}</span>`).join('')}</span></span>${draft.model === id ? ic('check', 16) : ''}</button>`;
    overlay(`<div class="ovhead"><b>Select Model</b><button class="ib" data-x aria-label="Close">${ic('x', 16)}</button></div><div class="mgrid" role="radiogroup" aria-label="Answer model">${card('', 'Default', def ? def.label.replace(/^.*? — /, '') : 'First engine with a key', ['Recommended'], false, '')}${list.map((m) => { const [prov, name] = m.label.split(' — '); const [n, sub] = String(name || m.label).split(' · '); return card(m.id, n, prov + (sub ? ' · ' + sub : ''), C.MODEL_TAGS[m.id] || [], m.disabled, m.disabled ? 'Add a key in Settings to use this model' : ''); }).join('')}</div>`, (b, close) => {
      $('[data-x]', b).onclick = close; b.onclick = (e) => { const c = e.target.closest('[data-m]'); if (!c || c.disabled) return; draft.model = c.dataset.m; updateRows(); close(); };
    });
  }
  function prefDialog(group) {
    const titles = { format: 'Format', length: 'Length', tone: 'Tone' };
    const draw = (b) => { const p = draft.prefs;
      $('#opts', b).innerHTML = C.PREF_OPTIONS[group].map((o) => `<label class="ropt ${p[group] === o.id ? 'on' : ''}"><input type="radio" name="${group}" value="${o.id}" ${p[group] === o.id ? 'checked' : ''} /><span class="grow"><b>${esc(o.label)}</b><small class="mute">${esc(o.hint)}</small></span></label>`).join('')
        + (group === 'format' ? `<div class="sep"></div><label class="ropt ck"><input type="checkbox" id="star" ${p.star ? 'checked' : ''} /><span class="grow"><b>Enable STAR Method</b><small class="mute">Situation, Task, Action, Result — for behavioral questions</small></span></label><label class="ropt ck"><input type="checkbox" id="code" ${p.code ? 'checked' : ''} /><span class="grow"><b>Include code</b><small class="mute">Add code to coding questions</small></span></label>` : ''); };
    overlay(`<div class="ovhead"><b>${titles[group]}</b><button class="ib" data-x aria-label="Close">${ic('x', 16)}</button></div><div id="opts" role="radiogroup" aria-label="${titles[group]}"></div><div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" data-x>Done</button></div>`, (b, close) => {
      draw(b); $$('[data-x]', b).forEach((x) => (x.onclick = close));
      b.onchange = (e) => { const t = e.target; if (t.name === group) draft.prefs[group] = t.value; else if (t.id === 'star') draft.prefs.star = t.checked; else if (t.id === 'code') draft.prefs.code = t.checked; else return; draft.prefs = C.normalizePrefs(draft.prefs); draw(b); updateRows(); const f = $('input:checked', b); if (f) f.focus(); };
    });
  }

  async function save() {
    draft.notes = $('#notes') ? $('#notes').value : draft.notes; const d = draft, job = d.sessionType !== 'regular', co = clean(d.company);
    const title = d.title.trim() || (d.sessionType === 'interview' ? co || 'Interview' : d.sessionType === 'mock' ? (co ? `Mock · ${co}` : 'Mock interview') : 'Call');
    const data = { type: d.sessionType, title, description: d.description.trim(), company: job ? co : '', role: job ? clean(d.role) : '', jobDescription: job ? d.jobDescription : '', resumeId: d.resumeId || null, docIds: d.docIds, folderPath: job ? '' : d.folderPath,
      language: d.language, model: d.model, prefs: C.normalizePrefs(d.prefs), notes: d.notes.trim(), autoGenerate: d.autoGenerate, saveTranscript: d.saveTranscript };
    const b = $('#save'); b.disabled = true;
    try { const r = editId ? await cue.sessions.update(editId, data) : await cue.sessions.create(data); draft = null; host.done(editId ? 'Changes saved' : 'Session created', r); }
    catch (e) { b.disabled = false; toast(e.message || 'Could not save the session', 5000); }
  }

  return { open, state: () => ({ sessionType: draft && draft.sessionType, step, draft }) };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createWizard };
