// Headless smoke test: node_modules/.bin/electron tools/smoke.js  (use xvfb-run on Linux). Mocks Ollama on :11434.
const { app, BrowserWindow } = require('electron'); const fs = require('fs'); const http = require('http'); const path = require('path');
const OUT = process.env.OUT || '/tmp/shots'; fs.mkdirSync(OUT, { recursive: true });
app.setPath('userData', fs.mkdtempSync('/tmp/cue-test-'));
process.env.CUE_GROQ_URL = 'http://127.0.0.1:11434';
process.env.CUE_OPENAI_URL = process.env.CUE_GEMINI_URL = 'http://127.0.0.1:11434/openai/v1';
require('../main.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// --- mock Groq (OpenAI-compatible) ---
global.__models = []; let first429 = true;
const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', async () => {
    if (req.headers.authorization !== 'Bearer gsk_test') { res.statusCode = 401; res.end('{"error":{"message":"bad key"}}'); return; }
    if (req.url === '/openai/v1/models') { res.end('{"data":[]}'); return; }
    if (req.url === '/openai/v1/audio/transcriptions') { global.__wavOk = b.includes('RIFF') && b.includes('whisper-large-v3-turbo'); res.end('{"text":"Tell me about yourself."}'); return; }
    if (req.url === '/openai/v1/chat/completions') {
      const j = JSON.parse(b); global.__lastChat = j; global.__models.push(j.model + (j.max_completion_tokens ? '[mct]' : '') + (j.reasoning_effort ? '[' + j.reasoning_effort + ']' : ''));
      if (j.model === 'gemini-3.8-flash' && first429) { first429 = false; res.statusCode = 429; res.setHeader('retry-after', '7'); res.end('{"error":{"message":"rate limit"}}'); return; }
      res.setHeader('content-type', 'text/event-stream');
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '<think>planning the answer' } }] }) + '\n\n'); res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: '…</think>' } }] }) + '\n\n');
      for (const w of 'I led the migration of our nightly pipelines to **PySpark on Databricks**, cutting runtime by about half.'.split(' ')) { res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: w + ' ' } }] }) + '\n\n'); await sleep(10); }
      res.write('data: ' + JSON.stringify({ choices: [{ delta: {} }], x_groq: { usage: { prompt_tokens: 812, completion_tokens: 40, completion_time: 0.08 } } }) + '\n\n'); res.end('data: [DONE]\n\n'); return;
    }
    res.statusCode = 404; res.end();
  });
}).listen(11434);
process.env.CUE_GROQ_URL = 'http://127.0.0.1:11434';
const logs = [];
app.whenReady().then(async () => {
  try {
    await sleep(1800);
    const w = BrowserWindow.getAllWindows()[0];
    w.webContents.on('console-message', (_e, lvl, msg, line, src) => { if (lvl >= 2) logs.push(`[w:${lvl}] ${msg} (${path.basename(src)}:${line})`); });
    const js = (c) => w.webContents.executeJavaScript(c);
    const shot = async (win, name) => { console.log('shot', name); await sleep(450); const img = await win.webContents.capturePage(); fs.writeFileSync(`${OUT}/${name}.png`, img.toPNG()); };
    const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)}).click()`);
    await shot(w, '01-empty');
    await js(`cue.settings.set({groqKey:'gsk_test', openaiKey:'gsk_test', geminiKey:'gsk_test', defaultModel:'gemini:gemini-3.8-flash'})`);
    console.log('key tests:', JSON.stringify(await js(`Promise.all(['openai','gemini','groq'].map((p)=>cue.setup.test(p)))`)));
    const tr = await js(`cue.stt.transcribe(new Float32Array(16000).map((_, i) => Math.sin(i / 5) * 0.2), 'en')`); console.log('transcribe:', JSON.stringify(tr), 'wavOk', global.__wavOk);
    // seed
    await js(`(async()=>{
      const r = await cue.docs.addText('resume','Rakesh_Koyyana_Resume.pdf','Data engineer. AbbVie. PySpark, Databricks, AWS Glue. Built ETL pipelines.','uploaded');
      await cue.docs.addText('document','System design cheat sheet.md','Partitioning, caching, idempotency.','uploaded');
      await cue.sessions.create({type:'interview',company:'Stripe',role:'Senior Data Engineer',jobDescription:'Build data pipelines in Spark.',resumeId:r.id,title:'Stripe'});
      await cue.sessions.create({type:'interview',company:'Databricks',role:'Solutions Architect',jobDescription:'Customer-facing.',title:'Databricks',status:'ended',usageMs:2400000});
      await cue.sessions.create({type:'regular',title:'Weekly project sync',description:'Cue desktop app standup',folderPath:'${__dirname.replace(/\\/g, '/')}/..'});
    })()`);
    await js('location.reload()'); await sleep(900);
    await shot(w, '02-list');
    await click('#create'); await sleep(700); await shot(w, '03-wizard1');
    await js(`document.querySelector('#company').value='Acme';document.querySelector('#company').dispatchEvent(new Event('input'))`);
    await click('#resumeBtn'); await sleep(400); await shot(w, '04-picker');
    await js(`document.querySelector('.menu .it[data-id]').click()`); await sleep(300);
    await click('#next'); await sleep(700); await shot(w, '05-wizard2');
    await click('#create'); await sleep(900);
    await js('location.reload()'); await sleep(800);
    await js(`document.querySelector('[data-start]').click()`); await sleep(1200); await shot(w, '06-connect');
    await click('#go'); await sleep(2500);
    await click('#bChat'); await js(`(()=>{const i=document.querySelector('#chatIn');i.value='Tell me about a pipeline you optimised';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}))})()`);
    await sleep(2200); await shot(w, '07-live-answer');
    // VAD test with synthetic audio and a stubbed transcriber
    const vad = await js(`(async()=>{ const lines=[]; const c=new SegmentChannel('Interviewer',(w,t)=>lines.push(t),()=>{},'en'); c.tx=async(a)=>({text:'heard '+Math.round(a.length/1600)+' frames',ms:900});
      Object.assign(c,{acc:[],accN:0,pre:[],seg:[],speech:false,quiet:0,voiced:0,noise:0.004,sinceInterim:0,seq:0,pending:false,level:0});
      const blk=(amp)=>{ const b=new Float32Array(128); for(let i=0;i<128;i++) b[i]=amp*Math.sin(i/3); return b; };
      for(let i=0;i<13*20;i++) c.feed(blk(0.0005));        // 2.6s silence
      for(let i=0;i<13*30;i++) c.feed(blk(0.2));           // 3s speech
      for(let i=0;i<13*12;i++) c.feed(blk(0.0005));        // 1.2s silence -> finalize
      for(let i=0;i<13*3;i++) c.feed(blk(0.2)); for(let i=0;i<13*10;i++) c.feed(blk(0.0005)); // 0.3s blip -> ignored
      await new Promise(r=>setTimeout(r,100)); return lines; })()`);
    console.log('VAD lines:', JSON.stringify(vad));
    // prompt-budget check: huge resume + project folder must be trimmed for the local model
    await js(`(async()=>{ const r = await cue.docs.addText('resume','Huge.txt','word '.repeat(30000),'uploaded'); const d = await cue.docs.addText('document','Big.md','doc '.repeat(20000),'uploaded');
      const s = await cue.sessions.create({type:'regular',title:'Budget',resumeId:r.id,docIds:[d.id],folderPath:'${__dirname.replace(/\\/g, '/')}/..',model:'ollama:local'});
      await cue.llm.ask({sessionId:s.id,question:'hi',transcript:Array.from({length:50},(_,i)=>({speaker:'Interviewer',text:'line '+i+' '.repeat(100)}))}); })()`);
    await sleep(1500); console.log('budget sysChars:', global.__lastChat?.messages?.[0]?.content?.length, 'user chars:', global.__lastChat?.messages?.slice(-1)[0]?.content?.length);
    await click('#lCollapse'); await sleep(900); await shot(w, '08-bubble'); console.log('bubble size', JSON.stringify(w.getBounds()));
    await js(`document.querySelector('#bubLogo').dispatchEvent(new PointerEvent('pointerdown',{screenX:10,screenY:10,pointerId:1}));document.querySelector('#bubLogo').dispatchEvent(new PointerEvent('pointerup',{pointerId:1}))`);
    await sleep(900); console.log('restored size', JSON.stringify(w.getBounds()));
    // light theme + dashboard
    await js(`(async()=>{await cue.settings.set({theme:'light'});applyTheme('light')})()`);
    await js('cue.win.openDashboard("sessions")'); await sleep(1800);
    const d = BrowserWindow.getAllWindows().find((x) => x !== w); d.setSize(1280, 820); d.webContents.on('console-message', (_e, lvl, msg, line, src) => { if (lvl >= 2) logs.push(`[d:${lvl}] ${msg} (${path.basename(src)}:${line})`); });
    await shot(d, '09-dash-sessions-light');
    await d.webContents.executeJavaScript(`cue.settings.set({theme:'dark'});applyTheme('dark');document.querySelector('[data-p=resumes]').click()`); await shot(d, '10-dash-resumes-dark');
    await d.webContents.executeJavaScript(`document.querySelector('[data-p=sessions]').click()`); await sleep(300); await shot(d, '11-dash-sessions-dark');
    await d.webContents.executeJavaScript(`document.querySelector('#gear').click()`); await sleep(500); await shot(d, '12-dash-settings');
  } catch (e) { console.log('TEST ERROR', e); }
  console.log('chat req:', JSON.stringify({ models: global.__models, reasoning: global.__lastChat?.reasoning_effort, sysChars: global.__lastChat?.messages?.[0]?.content?.length }));
  console.log('console problems:\n' + logs.join('\n'));
  app.exit(0);
});
