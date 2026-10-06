// catalog.js — data + pure logic for the session wizard. No DOM access, so it loads in the renderer (global CATALOG)
// and in the main process / Node tests (require). Single source of truth for answer preferences: the wizard UI, the
// answer preview and main.js's system prompt all read the same option ids.
(function (root) {
  const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- companies
  const COMPANIES = [
    ...['Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'Netflix', 'NVIDIA', 'Intel', 'AMD', 'IBM', 'Oracle', 'Salesforce', 'Adobe', 'Cisco', 'Qualcomm', 'Tesla', 'Uber', 'Airbnb', 'Stripe', 'Shopify', 'Atlassian', 'Snowflake', 'Databricks', 'Palantir', 'Block', 'PayPal', 'Visa', 'Mastercard',
      'OpenAI', 'Anthropic', 'LinkedIn', 'Spotify', 'Dell Technologies', 'HP', 'VMware', 'SAP', 'Siemens', 'Samsung Electronics', 'Sony', 'Texas Instruments', 'Walmart', 'Target', 'Costco', 'The Home Depot', 'Lockheed Martin', 'Boeing', 'Raytheon', 'Johnson & Johnson', 'Pfizer', 'UnitedHealth Group',
      'JPMorgan Chase', 'Goldman Sachs', 'Morgan Stanley', 'Bank of America', 'Wells Fargo', 'Citigroup', 'Capital One', 'Deloitte', 'PwC', 'EY', 'KPMG', 'Accenture', 'McKinsey & Company', 'Boston Consulting Group', 'Bain & Company',
      'Infosys', 'Tata Consultancy Services', 'Wipro', 'Cognizant', 'HCLTech', 'Capgemini', 'UST Global'].map((name) => ({ name, kind: 'Company' })),
    ...['Massachusetts Institute of Technology', 'Stanford University', 'Harvard University', 'University of California, Berkeley', 'Carnegie Mellon University', 'Georgia Institute of Technology', 'University of Texas at Dallas', 'University of North Texas', 'Texas A&M University', 'University of Texas at Austin',
      'University of Illinois Urbana-Champaign', 'Purdue University', 'University of Michigan', 'Cornell University', 'Columbia University', 'New York University', 'Arizona State University', 'University of Toronto', 'University of Waterloo', 'University of Oxford', 'University of Cambridge', 'ETH Zurich',
      'National University of Singapore', 'Tsinghua University', 'Peking University', 'University of Science and Technology of China', 'University of Santo Tomas', 'Indian Institute of Technology Bombay', 'Indian Institute of Technology Madras', 'University of Southern California'].map((name) => ({ name, kind: 'University' })),
  ];

  const STOP = new Set(['of', 'the', 'and', 'at', 'for', 'in', '&']);
  const wordsOf = (name) => { const out = []; const re = /[A-Za-z0-9]+/g; let m; while ((m = re.exec(name))) out.push({ w: m[0], start: m.index }); return out; };

  // Returns { score, ranges } (ranges are [start, end) character spans to bold) or null.
  //   prefix 100 > word-prefix 80 > acronym of significant words 70 > substring 50
  function matchEntity(query, name) {
    const q = String(query || '').trim().toLowerCase(); if (!q) return { score: 0, ranges: [] };
    const l = name.toLowerCase();
    if (l.startsWith(q)) return { score: 100, ranges: [[0, q.length]] };
    for (let i = l.indexOf(q); i >= 0; i = l.indexOf(q, i + 1)) if (!/[a-z0-9]/.test(l[i - 1] || ' ')) return { score: 80, ranges: [[i, i + q.length]] };
    const sig = wordsOf(name).filter((x) => !STOP.has(x.w.toLowerCase())); const flat = q.replace(/[\s.]+/g, '');
    if (flat.length >= 2 && flat.length <= sig.length && sig.slice(0, flat.length).every((x, i) => x.w[0].toLowerCase() === flat[i])) return { score: 70, ranges: sig.slice(0, flat.length).map((x) => [x.start, x.start + 1]) }; // "UST" -> University of Santo Tomas
    const i = l.indexOf(q); if (i >= 0) return { score: 50, ranges: [[i, i + q.length]] };
    return null;
  }
  // Escapes the name, wrapping the matched spans in <b>.
  function highlight(name, ranges) {
    const rs = [...(ranges || [])].sort((a, b) => a[0] - b[0]).reduce((acc, r) => { const last = acc[acc.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else acc.push([...r]); return acc; }, []);
    let out = '', at = 0; for (const [s, e] of rs) { out += escHtml(name.slice(at, s)) + '<b>' + escHtml(name.slice(s, e)) + '</b>'; at = e; }
    return out + escHtml(name.slice(at));
  }
  function logoOf(name) { // deterministic placeholder avatar: initials + hue
    const sig = wordsOf(name).filter((x) => !STOP.has(x.w.toLowerCase())); let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return { initials: (sig.length > 1 ? sig[0].w[0] + sig[1].w[0] : (sig[0] ? sig[0].w[0] : '?')).toUpperCase(), hue: h };
  }
  // extra: names from the user's earlier sessions, listed first when nothing is typed.
  function filterCompanies(query, extra = [], limit = 40) {
    const have = new Set(COMPANIES.map((c) => c.name.toLowerCase()));
    const all = [...extra.filter((n) => n && !have.has(String(n).toLowerCase())).map((name) => ({ name: String(name), kind: 'Recent' })), ...COMPANIES];
    const q = String(query || '').trim();
    const rows = q ? all.map((e) => ({ e, m: matchEntity(q, e.name) })).filter((x) => x.m).sort((a, b) => b.m.score - a.m.score || a.e.name.length - b.e.name.length || a.e.name.localeCompare(b.e.name))
      : all.slice(0, Math.min(limit, 8)).map((e) => ({ e, m: { score: 0, ranges: [] } }));
    return rows.slice(0, limit).map(({ e, m }) => ({ name: e.name, kind: e.kind, html: highlight(e.name, m.ranges), ...logoOf(e.name) }));
  }

  // ---------------------------------------------------------------- languages
  const LANG_LIST = [['ar', 'Arabic'], ['bg', 'Bulgarian'], ['ca', 'Catalan'], ['zh', 'Chinese'], ['hr', 'Croatian'], ['cs', 'Czech'], ['da', 'Danish'], ['nl', 'Dutch'], ['en', 'English'], ['et', 'Estonian'], ['fi', 'Finnish'], ['fr', 'French'], ['de', 'German'], ['el', 'Greek'], ['he', 'Hebrew'], ['hi', 'Hindi'],
    ['hu', 'Hungarian'], ['id', 'Indonesian'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean'], ['lv', 'Latvian'], ['lt', 'Lithuanian'], ['ms', 'Malay'], ['no', 'Norwegian'], ['pl', 'Polish'], ['pt', 'Portuguese'], ['ro', 'Romanian'], ['ru', 'Russian'], ['sk', 'Slovak'],
    ['sl', 'Slovenian'], ['es', 'Spanish'], ['sv', 'Swedish'], ['ta', 'Tamil'], ['te', 'Telugu'], ['th', 'Thai'], ['tr', 'Turkish'], ['uk', 'Ukrainian'], ['vi', 'Vietnamese']].sort((a, b) => a[1].localeCompare(b[1]));
  const languageName = (code) => (LANG_LIST.find((l) => l[0] === code) || [code, code || 'English'])[1];
  function filterLanguages(q) { q = String(q || '').trim().toLowerCase(); return q ? LANG_LIST.filter(([c, n]) => n.toLowerCase().includes(q) || c === q) : LANG_LIST; }

  // ---------------------------------------------------------------- models (qualitative tags, keyed by "provider:model")
  const MODEL_TAGS = {
    'gemini:gemini-3.8-flash': ['Best free', 'Balanced'], 'gemini:gemini-3.5-flash-lite': ['Fastest', 'Free'], 'openai:gpt-5.6-luna': ['Fast', 'Accurate'],
    'anthropic:claude-haiku-4-5-20251001': ['Fast', 'Concise'], 'anthropic:claude-sonnet-5-5': ['Most accurate', 'Slower'], 'groq:openai/gpt-oss-120b': ['Free backup'],
  };

  // ---------------------------------------------------------------- answer preferences
  const PREF_OPTIONS = {
    format: [{ id: 'script', label: 'Full script', hint: 'Complete sentences you can read aloud' }, { id: 'script_bullets', label: 'Script + bullets', hint: 'A short spoken opener, then the key points' }, { id: 'bullets', label: 'Bullet points', hint: 'Short bullets you can say in your own words' }],
    length: [{ id: 'short', label: 'Short', hint: 'Quick answer' }, { id: 'balanced', label: 'Balanced', hint: 'Core answer' }, { id: 'long', label: 'Long', hint: 'More explanation' }],
    tone: [{ id: 'simple', label: 'Simple', hint: 'Plain words' }, { id: 'formal', label: 'Formal', hint: 'Precise wording' }],
  };
  const DEFAULT_PREFS = { format: 'script', length: 'short', tone: 'simple', star: false, code: true };
  const has = (group, id) => PREF_OPTIONS[group].some((o) => o.id === id);
  // Accepts new prefs or the legacy { style: concise|detailed|star, format: speakable|bullets|paragraph, code } shape.
  function normalizePrefs(p) {
    p = p && typeof p === 'object' ? p : {}; const out = { ...DEFAULT_PREFS };
    out.format = has('format', p.format) ? p.format : p.format === 'bullets' ? 'bullets' : 'script'; // legacy: speakable/paragraph -> script
    if (has('length', p.length)) out.length = p.length; else if (p.style === 'detailed') out.length = 'long'; else if (p.style === 'star') out.length = 'balanced';
    out.tone = has('tone', p.tone) ? p.tone : 'simple';
    out.star = typeof p.star === 'boolean' ? p.star : p.style === 'star';
    out.code = p.code !== false;
    return out;
  }
  const labelOf = (group, id) => (PREF_OPTIONS[group].find((o) => o.id === id) || PREF_OPTIONS[group][0]).label;
  // The system-prompt rules for a prefs object (used by main.js buildSystem).
  function promptRules(prefs) {
    const p = normalizePrefs(prefs);
    return {
      length: { short: 'Keep answers short: 2-5 sentences the user can say out loud immediately.', balanced: 'Give a balanced answer: the core point first, then the key supporting detail, in about 5-8 sentences.', long: 'Give thorough answers with reasoning, examples and trade-offs.' }[p.length],
      format: { script: 'Write a full spoken script in natural first person, no markdown headings.', script_bullets: 'Start with a one or two sentence spoken opener in first person, then tight bullet points with the key details.', bullets: 'Reply with short bullet points the user can say in their own words; full sentences are not needed.' }[p.format],
      tone: { simple: 'Use simple, plain words and short sentences.', formal: 'Use formal, precise wording.' }[p.tone],
      star: p.star ? 'For behavioral questions use STAR (Situation, Task, Action, Result) built from the user\'s real experience.' : '',
      code: p.code ? 'For coding questions give the approach, then clean code, then complexity.' : 'Do not include code blocks unless explicitly asked.',
    };
  }

  // ---------------------------------------------------------------- answer preview
  // Each line is [simple, formal]. Placeholders in [brackets] and **bold** key figures show the shape of a real answer.
  const L = (s, f) => [s, f];
  const PREVIEW = {
    coding: { label: 'Coding (LeetCode-style)', behavioral: false, q: 'Two Sum — return the indices of two numbers that add up to a target.',
      lines: [L('I\'d use a hash map so I only pass over the array once.', 'I would employ a hash map so that the array is traversed only once.'), L('For each number I check if **target − number** is already in the map.', 'For each element, I verify whether **target − element** is already stored in the map.'),
        L('If it is, I return both indexes. If not, I store the number and move on.', 'If it is present, I return both indices; otherwise I record the element and continue.'), L('That gives **O(n) time** and **O(n) space**.', 'This yields **O(n) time complexity** and **O(n) space complexity**.'),
        L('A brute-force double loop would be **O(n²)**, so the map is the better trade.', 'A brute-force nested loop would be **O(n²)**; the hash map is the superior trade-off.'), L('I\'d also test an empty array and duplicate values before calling it done.', 'I would also verify the empty-array and duplicate-value cases before concluding.')],
      bullets: [L('Use a hash map: number → index', 'Employ a hash map from value to index'), L('Check **target − number** at each step', 'Test **target − value** at each step'), L('Return as soon as a match is found', 'Return as soon as a match is located'), L('**O(n)** time, **O(n)** space', '**O(n)** time and **O(n)** space'), L('Edge cases: empty input, duplicates', 'Edge cases: empty input and duplicate values')],
      code: '```python\ndef two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n```' },
    experience: { label: 'Experience check', behavioral: true, q: 'Have you worked with [Technology] in production?',
      lines: [L('Yes. I used **[Technology]** for about **[2 years]** at [Company].', 'Yes. I utilised **[Technology]** for approximately **[2 years]** at [Company].'), L('The goal was to cut report load times for **[40,000] daily users**.', 'The objective was to reduce report load times for **[40,000] daily users**.'),
        L('I designed the caching layer and wrote the migration plan.', 'I designed the caching layer and authored the migration plan.'), L('I worked with two teammates and we reviewed every change together.', 'I collaborated with two colleagues and we reviewed each change jointly.'),
        L('Load time dropped by **[35%]** and support tickets fell by **[20%]**.', 'Load time decreased by **[35%]** and support tickets declined by **[20%]**.'), L('I\'m happy to go deeper on any part of it.', 'I would be glad to elaborate on any part of it.')],
      bullets: [L('Used [Technology] for **[2 years]** at [Company]', 'Utilised [Technology] for **[2 years]** at [Company]'), L('Owned the caching layer end to end', 'Held end-to-end ownership of the caching layer'), L('Cut load time by **[35%]**', 'Reduced load time by **[35%]**'), L('Served **[40,000] daily users**', 'Supported **[40,000] daily users**'), L('Happy to go deeper on any part', 'Prepared to elaborate on any component')],
      star: { S: [L('At [Company] our reports took **[8 seconds]** to load for **[40,000] daily users**.', 'At [Company], our reports required **[8 seconds]** to load for **[40,000] daily users**.')], T: [L('I was asked to bring that under **[3 seconds]**.', 'I was tasked with reducing that to under **[3 seconds]**.')],
        A: [L('I added a caching layer with **[Technology]**.', 'I implemented a caching layer using **[Technology]**.'), L('I wrote the migration plan and reviewed every change with two teammates.', 'I authored the migration plan and reviewed every change with two colleagues.')],
        R: [L('Load time dropped by **[35%]**.', 'Load time decreased by **[35%]**.'), L('Support tickets fell by **[20%]** the next quarter.', 'Support tickets declined by **[20%]** the following quarter.')] } },
    howdo: { label: 'How-do-you', behavioral: true, q: 'How do you handle tight deadlines?',
      lines: [L('I start by agreeing on what truly has to ship.', 'I begin by confirming precisely what must be delivered.'), L('I break the work into pieces of **one day or less**.', 'I decompose the work into units of **one day or less**.'), L('I flag risks early, usually within the **first 24 hours**.', 'I raise risks early, typically within the **first 24 hours**.'),
        L('I cut scope before I cut quality.', 'I reduce scope before compromising quality.'), L('On my last project this got us out **[3 days early]**.', 'On my most recent project this delivered us **[3 days early]**.'), L('Afterwards I run a short retro so the next one is easier.', 'Afterwards I conduct a brief retrospective so subsequent deadlines are easier.')],
      bullets: [L('Agree on what truly has to ship', 'Confirm precisely what must be delivered'), L('Split work into pieces of **≤ 1 day**', 'Decompose work into units of **≤ 1 day**'), L('Flag risks in the **first 24 hours**', 'Raise risks within the **first 24 hours**'), L('Cut scope, not quality', 'Reduce scope, not quality'), L('Shipped **[3 days early]** last time', 'Delivered **[3 days early]** most recently')],
      star: { S: [L('Last quarter at [Company] a release moved up by **[two weeks]**.', 'Last quarter at [Company], a release was brought forward by **[two weeks]**.')], T: [L('I had to keep the team on track without cutting corners.', 'I needed to keep the team on track without compromising standards.')],
        A: [L('I agreed the must-haves, split the work into **one-day** pieces and flagged risks early.', 'I confirmed the essentials, decomposed the work into **one-day** units and raised risks early.'), L('I cut two nice-to-have features instead of rushing.', 'I removed two non-essential features rather than rushing.')],
        R: [L('We shipped **[3 days early]** with no critical bugs.', 'We delivered **[3 days early]** with no critical defects.'), L('The team kept the same approach for later releases.', 'The team retained the same approach for subsequent releases.')] } },
    situational: { label: 'Situational', behavioral: true, q: 'A teammate keeps missing handoffs. What do you do?',
      lines: [L('I\'d talk to them privately first and ask what\'s getting in the way.', 'I would speak with them privately first and ask what is obstructing them.'), L('Often there\'s a blocker I can\'t see, like unclear ownership.', 'Frequently there is an obstacle that is not visible, such as unclear ownership.'), L('We\'d agree on a **simple handoff checklist**.', 'We would agree on a **simple handoff checklist**.'),
        L('I\'d check in again after **[one week]**.', 'I would follow up after **[one week]**.'), L('If nothing changed, I\'d bring in our lead as a team problem, not a blame.', 'If nothing changed, I would involve our lead as a team matter, not as blame.'), L('The goal is to keep the work moving and the relationship strong.', 'The aim is to keep the work progressing and the relationship strong.')],
      bullets: [L('Talk privately, ask what\'s blocking them', 'Speak privately and ask what is obstructing them'), L('Look for unclear ownership', 'Look for unclear ownership'), L('Agree a **simple handoff checklist**', 'Agree a **simple handoff checklist**'), L('Check in after **[one week]**', 'Follow up after **[one week]**'), L('Escalate as a team issue, not blame', 'Escalate as a team matter, not as blame')],
      star: { S: [L('On a past project a teammate kept missing handoffs and it slowed **[3 people]**.', 'On a past project, a colleague repeatedly missed handoffs, delaying **[3 people]**.')], T: [L('I needed to fix the flow without damaging trust.', 'I needed to correct the flow without damaging trust.')],
        A: [L('I asked what was in the way and found ownership was unclear.', 'I asked what was obstructing them and found ownership was unclear.'), L('We agreed a one-page checklist and checked in after **[one week]**.', 'We agreed a one-page checklist and followed up after **[one week]**.')],
        R: [L('Handoffs were on time for the next **[6 sprints]**.', 'Handoffs were on time for the following **[6 sprints]**.'), L('The checklist became a team habit.', 'The checklist became standard team practice.')] } },
    intro: { label: 'Tell me about yourself', behavioral: false, q: 'Tell me about yourself.',
      lines: [L('I\'m a **[Role]** with **[4 years]** of experience in [Field].', 'I am a **[Role]** with **[4 years]** of experience in [Field].'), L('Most recently at [Company] I led **[3 projects]** for **[10,000 users]**.', 'Most recently at [Company], I led **[3 projects]** serving **[10,000 users]**.'), L('I enjoy turning messy problems into simple, reliable systems.', 'I enjoy converting complex problems into simple, reliable systems.'),
        L('I\'m strongest at [Skill 1] and [Skill 2].', 'My principal strengths are [Skill 1] and [Skill 2].'), L('That\'s why the **[Role]** position at **[Target Company]** caught my eye.', 'That is why the **[Role]** position at **[Target Company]** interested me.'), L('I\'d love to talk about how I can help the team.', 'I would welcome discussing how I can contribute to the team.')],
      bullets: [L('**[Role]**, **[4 years]** in [Field]', '**[Role]**, **[4 years]** in [Field]'), L('Led **[3 projects]** at [Company]', 'Led **[3 projects]** at [Company]'), L('Strengths: [Skill 1], [Skill 2]', 'Principal strengths: [Skill 1], [Skill 2]'), L('Why **[Target Company]**: [reason]', 'Interest in **[Target Company]**: [reason]'), L('Ready to help the team', 'Prepared to contribute to the team')] },
  };
  const PREVIEW_CATEGORIES = Object.entries(PREVIEW).map(([id, c]) => ({ id, label: c.label, behavioral: c.behavioral }));
  const COUNTS = { short: { lines: 2, lead: 1, bullets: 2, star: 1 }, balanced: { lines: 4, lead: 1, bullets: 3, star: 2 }, long: { lines: 6, lead: 2, bullets: 5, star: 2 } };

  // Returns { md, note } — markdown (rendered by common.js md()) mirroring what a real answer would look like for these prefs.
  function buildPreview(categoryId, prefs) {
    const cat = PREVIEW[categoryId] || PREVIEW.coding, p = normalizePrefs(prefs), n = COUNTS[p.length], t = p.tone === 'formal' ? 1 : 0, pick = (a) => a[t];
    const parts = [`**Q:** ${cat.q}`]; let note = '';
    if (p.star && !cat.behavioral) note = 'STAR is only applied to behavioral questions, so this category is unchanged.';
    if (p.star && cat.behavioral) {
      const take = (arr, k) => arr.slice(0, k).map(pick).join(' '); const k = n.star;
      const items = [['Situation', take(cat.star.S, 1)], ['Task', take(cat.star.T, 1)], ['Action', take(cat.star.A, k)], ['Result', take(cat.star.R, k)]].map(([l, x]) => `**${l}:** ${x}`);
      if (p.format === 'script') parts.push(items.join('\n'));
      else if (p.format === 'script_bullets') parts.push(items[0], '', ...items.slice(1).map((x) => '• ' + x));
      else parts.push(...items.map((x) => '• ' + x));
    } else if (p.format === 'script') parts.push(cat.lines.slice(0, n.lines).map(pick).join(' '));
    else if (p.format === 'script_bullets') parts.push(cat.lines.slice(0, n.lead).map(pick).join(' '), '', '**Key points**', ...cat.bullets.slice(0, n.bullets).map((b) => '• ' + pick(b)));
    else parts.push(...cat.bullets.slice(0, n.bullets).map((b) => '• ' + pick(b)));
    if (p.code && cat.code) parts.push('', cat.code);
    return { md: parts.join('\n'), note };
  }

  const CATALOG = { COMPANIES, matchEntity, highlight, logoOf, filterCompanies, LANG_LIST, languageName, filterLanguages, MODEL_TAGS, PREF_OPTIONS, DEFAULT_PREFS, normalizePrefs, labelOf, promptRules, PREVIEW_CATEGORIES, buildPreview };
  if (typeof module !== 'undefined' && module.exports) module.exports = CATALOG; else root.CATALOG = CATALOG;
})(typeof window !== 'undefined' ? window : globalThis);
