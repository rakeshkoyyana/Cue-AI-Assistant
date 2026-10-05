const { contextBridge, ipcRenderer } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
const on = (ch, cb) => ipcRenderer.on(ch, (_e, d) => cb(d));
contextBridge.exposeInMainWorld('cue', {
  settings: { get: () => inv('settings:get'), set: (s) => inv('settings:set', s) },
  sessions: {
    list: () => inv('sessions:list'), get: (id) => inv('sessions:get', id), create: (s) => inv('sessions:create', s),
    update: (id, patch) => inv('sessions:update', id, patch), remove: (id) => inv('sessions:remove', id),
  },
  docs: {
    list: () => inv('docs:list'), importFiles: (kind) => inv('docs:import', kind), addText: (kind, name, text, source) => inv('docs:addText', kind, name, text, source),
    remove: (id) => inv('docs:remove', id), preview: (id) => inv('docs:preview', id),
  },
  folder: { pick: () => inv('folder:pick'), summary: (p) => inv('folder:summary', p) },
  job: { import: (url) => inv('job:import', url) },
  llm: {
    ask: (p) => inv('llm:ask', p), abort: (id) => inv('llm:abort', id), complete: (p) => inv('llm:complete', p), summarize: (id) => inv('llm:summarize', id),
    onChunk: (cb) => on('llm:chunk', cb), onDone: (cb) => on('llm:done', cb),
  },
  capture: { screenshot: () => inv('capture:screenshot') },
  deepgramKey: () => inv('deepgram:key'),
  setup: { status: (lang) => inv('setup:status', lang), pullModel: (n) => inv('ollama:pull', n), warm: (sid) => inv('ollama:warm', sid), initStt: (lang) => inv('stt:init', lang), onProgress: (cb) => on('setup:progress', cb), open: (u) => inv('app:openExternal', u) },
  stt: { transcribe: (samples, lang) => inv('stt:transcribe', samples, lang) },
  win: {
    size: (w, h) => inv('win:size', w, h), collapse: () => inv('win:collapse'), bubble: (on) => inv('win:bubble', on), moveBy: (dx, dy) => inv('win:moveBy', dx, dy), nextScreen: () => inv('win:nextScreen'), zoom: (d) => inv('win:zoom', d),
    close: () => inv('win:close'), opacity: (v) => inv('win:opacity', v), openDashboard: (hash) => inv('dashboard:open', hash),
    startSession: (id) => inv('widget:startSession', id), liveHotkeys: (on) => inv('hotkeys:live', on),
  },
  onHotkey: (cb) => on('hotkey', cb),
  onGotoLive: (cb) => on('goto-live', cb),
  onDashNav: (cb) => on('dash-nav', cb),
});
