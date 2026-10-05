# Cue

A private, self-hosted AI copilot for interviews and calls (Electron). Your data stays on your computer; API keys are encrypted with your OS keychain.

## Free by default (v0.2)

Cue now runs with **no paid keys**:

| Job | Free engine | One-time setup |
|---|---|---|
| Answers | **Ollama** (local LLM, default `gemma3:4b`) | Install Ollama from ollama.com, then press *Download* in Cue's Setup screen |
| Live transcription | **Whisper** (runs on your CPU via `@huggingface/transformers`) | Press *Download* (~80 MB) in Setup |
| Screenshots | Vision model if installed (Gemma 3 can), otherwise built-in OCR (`tesseract.js`) | none |

Anthropic Claude and Deepgram are still supported as **optional cloud engines** (Settings → Cloud engines). Leave them empty and nothing leaves your computer.

### Rebranding
Name and logo live in `renderer/brand.js` (`BRAND.name`, `BRAND.mark`). `node tools/render-sheet.js` renders the logo option sheet.

### Development
`npm run icons` regenerates `renderer/icons.js` from Lucide. `npm run test:smoke` runs a headless UI test against a mocked Ollama.

## Run
```
npm install
npm start
```
Click the ⋮ menu in the widget → **Settings** and add:
- **Anthropic API key** (or choose the local Ollama provider for fully offline answers)
- **Deepgram API key** (live transcription)

## What's inside
**Widget (floating, always on top)**
- Session list with search + sort, Ready/Ended status, Start Session
- Create Session wizard: Interview (company, role, job description, resume, documents, *import from job link*) or Regular (title, description, documents, **whole project folder as context**), then Preferences (language, model, answer style/format, AI instructions, Auto Generate, Save Transcript)
- Connect screen → live overlay: Answer, Screenshot, Chat, live transcript (mic = You, system audio = Interviewer/Participant), answer cards with prev/next and copy, timer, opacity, summarize
- ⋮ menu: Dashboard, Next Screen, Settings, Zoom, Theme (light/dark/system)

**Dashboard window**
- Call Sessions (Active/Past, tabs, grid/list, View Transcript), Resumes, Documents
- Prepare: Question Bank, Mock Interview (AI interviewer speaks questions aloud), Resume Maker

## Hotkeys (active only during a live session)
Ctrl/⌘+Enter Answer · Ctrl/⌘+Shift+Enter Screenshot · Ctrl/⌘+Shift+Space Chat · Ctrl/⌘+Shift+Backspace Clear transcript · Ctrl/⌘+←/→ previous/next answer · Ctrl/⌘+Shift+H hide/show window

## Notes
- macOS system audio needs a loopback device such as BlackHole; Windows works out of the box. Without it Cue hears your mic only.
- Use a vision-capable Ollama model (e.g. llava) if you want screenshot analysis locally.
- Not included on purpose: hiding the window from screen-share capture.
- Not included: Headshots, referrals/subscription, cloud accounts.
- Build installers: `npm run dist`.
