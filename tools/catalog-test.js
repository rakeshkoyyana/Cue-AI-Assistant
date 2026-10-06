// Plain-Node tests for the wizard's data/logic (renderer/catalog.js) and the waveform peaks (renderer/wave.js). Run: npm run test:catalog
const assert = require('assert');
const C = require('../renderer/catalog');
const W = require('../renderer/wave');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok   ' + name); };
const strip = (h) => h.replace(/<\/?b>/g, '');

t('"UST" lists both universities, with UST Global first (exact prefix)', () => {
  const r = C.filterCompanies('UST').map((x) => strip(x.html));
  assert.strictEqual(r[0], 'UST Global'); assert(r.includes('University of Santo Tomas')); assert(r.includes('University of Science and Technology of China'));
});
t('matched letters are bold and everything else is escaped', () => {
  const r = C.filterCompanies('UST').find((x) => strip(x.html) === 'University of Santo Tomas');
  assert.strictEqual(r.html, '<b>U</b>niversity of <b>S</b>anto <b>T</b>omas');
  assert.strictEqual(C.highlight('A<b>&Co', [[0, 1]]), '<b>A</b>&lt;b&gt;&amp;Co');
});
t('every row has a deterministic logo placeholder', () => {
  const a = C.logoOf('Google'), b = C.logoOf('Google'); assert.deepStrictEqual(a, b); assert.strictEqual(a.initials.length >= 1, true); assert(a.hue >= 0 && a.hue < 360);
});
t('no query shows a short default list; recent names come first; junk matches nothing', () => {
  assert(C.filterCompanies('').length <= 8); assert.strictEqual(C.filterCompanies('', ['Acme Rockets'])[0].name, 'Acme Rockets'); assert.deepStrictEqual(C.filterCompanies('zzzzqqq'), []);
});
t('languages are alphabetical and searchable', () => {
  const names = C.LANG_LIST.map((l) => l[1]); assert.deepStrictEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  const i = names.indexOf('Croatian'); assert.deepStrictEqual(names.slice(i, i + 3), ['Croatian', 'Czech', 'Danish']); assert(names.includes('English'));
  assert.deepStrictEqual(C.filterLanguages('cro').map((l) => l[1]), ['Croatian']); assert.strictEqual(C.languageName('en'), 'English');
});
t('legacy prefs migrate; bad input falls back to defaults', () => {
  assert.deepStrictEqual(C.normalizePrefs({ style: 'star', format: 'speakable', code: false }), { format: 'script', length: 'balanced', tone: 'simple', star: true, code: false });
  assert.deepStrictEqual(C.normalizePrefs({ style: 'detailed', format: 'bullets' }), { ...C.DEFAULT_PREFS, format: 'bullets', length: 'long' });
  assert.deepStrictEqual(C.normalizePrefs(null), C.DEFAULT_PREFS); assert.strictEqual(C.normalizePrefs({ tone: '<script>' }).tone, 'simple');
});
t('prompt rules cover every option, including STAR and code', () => {
  for (const f of C.PREF_OPTIONS.format) for (const l of C.PREF_OPTIONS.length) for (const tn of C.PREF_OPTIONS.tone) { const r = C.promptRules({ format: f.id, length: l.id, tone: tn.id }); assert(r.length && r.format && r.tone); }
  assert(/STAR/.test(C.promptRules({ star: true }).star)); assert.strictEqual(C.promptRules({ star: false }).star, ''); assert(/Do not include code/.test(C.promptRules({ code: false }).code));
});
t('preview changes with format, length, tone, STAR and category', () => {
  const a = C.buildPreview('coding', { format: 'script', length: 'short' }).md, b = C.buildPreview('coding', { format: 'bullets', length: 'long' }).md;
  assert.notStrictEqual(a, b); assert(b.includes('•')); assert(C.buildPreview('coding', { length: 'long' }).md.length > C.buildPreview('coding', { length: 'short' }).md.length);
  assert.notStrictEqual(C.buildPreview('intro', { tone: 'simple' }).md, C.buildPreview('intro', { tone: 'formal' }).md);
  const star = C.buildPreview('experience', { star: true }).md; assert(/\*\*Situation:\*\*/.test(star) && /\*\*Result:\*\*/.test(star));
  const nb = C.buildPreview('coding', { star: true }); assert(nb.note && !/Situation/.test(nb.md)); assert(/\[Technology\]|\*\*\[/.test(C.buildPreview('experience', {}).md));
});
t('all five preview categories exist and render', () => {
  assert.deepStrictEqual(C.PREVIEW_CATEGORIES.map((c) => c.label), ['Coding (LeetCode-style)', 'Experience check', 'How-do-you', 'Situational', 'Tell me about yourself']);
  for (const c of C.PREVIEW_CATEGORIES) assert(C.buildPreview(c.id, {}).md.startsWith('**Q:**'));
});
t('waveform peaks are normalised, bucketed, and safe on empty input', () => {
  assert.deepStrictEqual([...W.computePeaks([Float32Array.from([0, 0.5, -1, 0.25, 0, 0, 0.1, 0.1])], 4)].map((x) => +x.toFixed(2)), [0.5, 1, 0, 0.1]);
  assert.strictEqual(W.computePeaks([], 10).length, 10); assert.strictEqual(W.computePeaks([new Float32Array(0)], 5).every((x) => x === 0), true); assert.strictEqual(W.computePeaks(null, 0).length, 0);
  assert.strictEqual(W.fmtClock(75), '1:15'); assert.strictEqual(W.fmtClock(NaN), '0:00');
});
console.log(`\nall ${n} passed`);
