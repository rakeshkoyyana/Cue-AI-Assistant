# Cue

A private, self-hosted AI copilot for interviews and calls (Electron). Your data stays on your computer; API keys are encrypted with your OS keychain.

## Fast cloud mode (v0.4)

Cue runs its AI in the cloud on **free tiers**, so answers start in about a second and your laptop stays cool:

| Job | Engine | Cost |
|---|---|---|
| Answers | **Groq** — GPT-OSS 120B by default (falls back to Llama 3.3 70B → GPT-OSS 20B → Llama 3.1 8B if a free-tier limit is hit) | Free tier |
| Transcription | **Groq Whisper** (same key, text ~1 s after each sentence) or **Deepgram Nova-3** (live word-by-word, $200 free credit) | Free |
| Screenshots | Local OCR (`tesseract.js`), text sent to the answer model | Free |
| Optional | Anthropic Claude (paid key) | Pay per use |

**Setup:** create a free key at [console.groq.com/keys](https://console.groq.com/keys) → open Cue → ⋮ → *Setup & Settings* → paste the key → Save. That's it.

**Privacy:** call audio and the questions (plus a trimmed copy of your resume/JD for context) are sent to Groq (and Deepgram if enabled). Sessions, resumes and documents are stored only on your computer.

Free-tier limits change; check yours at console.groq.com/settings/limits.

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
