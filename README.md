# Cue

A private, self-hosted AI calls (Electron). Your data stays on your computer; API keys are encrypted with your OS keychain.

## AI engines (v0.5)

Pick any answer engine in **⋮ → Setup & Settings** (paste a key, choose the default model):

| Engine | Models | Cost |
|---|---|---|
| Google Gemini | **Gemini 3.8 Flash** (best free), Gemini 3.5 Flash-Lite (fastest free) | free tier (free-tier prompts may be used to improve Google's products) |
| Groq | GPT-OSS 120B — automatic backup | free tier |
| OpenAI | GPT-5.6 Luna | pay-per-use |
| Anthropic | Claude Haiku 4.5, Claude Sonnet 5.5 | pay-per-use |

Only strong models are offered. If the chosen engine is rate-limited or down before an answer starts, Cue automatically retries on the next engine that has a key.

**Live captions:** Deepgram Nova-3 streams word-by-word transcription of you and the other side ($200 free credit on new accounts). Without it, Groq Whisper transcribes sentence by sentence.

Screenshots go straight to vision-capable models (OpenAI, Gemini, Claude); Groq gets local OCR text. Reasoning is kept short and never shown — only the answer streams in.

**Privacy:** audio goes to the caption engine; questions plus your resume/JD context go to the answer engine. Sessions, resumes and documents stay on your computer.

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
- Session Video: pick a local recording and extract 1 frame/second (max 1280 px wide) with live progress, cancel, and a clear-frames button. Needs `ffmpeg` (`brew install ffmpeg`)
- Prepare: Question Bank, Mock Interview (AI interviewer speaks questions aloud), Resume Maker

## Hotkeys (active only during a live session)
Ctrl/⌘+Enter Answer · Ctrl/⌘+Shift+Enter Screenshot · Ctrl/⌘+Shift+Space Chat · Ctrl/⌘+Shift+Backspace Clear transcript · Ctrl/⌘+←/→ previous/next answer · Ctrl/⌘+Shift+H hide/show window

## Notes
- macOS system audio needs a loopback device such as BlackHole; Windows works out of the box. Without it Cue hears your mic only.
- Use a vision-capable Ollama model (e.g. llava) if you want screenshot analysis locally.
- Build installers: `npm run dist`.

## Window controls
- **Move:** click the move icon to pick one of 6 screen positions (top/bottom × left/center/right), or press **⌘ ⇧ + arrow keys** anywhere while Cue is visible.
- **Hide:** shrinks Cue to just its logo; click to restore, drag to reposition. A red dot means a session is running.
- **All desktops:** Cue follows you across macOS Spaces (three-finger swipe) and over full-screen apps.
- **⌘ ⇧ H** shows/hides Cue.

## Current setup (what to use today)

| Job | Engine | Key from | Cost |
|---|---|---|---|
| Answers (default) | Google Gemini 3.8 Flash (free API tier) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Free |
| Answers backup | Groq GPT-OSS 120B — used automatically if Gemini is rate-limited | [console.groq.com/keys](https://console.groq.com/keys) | Free |
| Live captions | Deepgram Nova-3, word-by-word | [console.deepgram.com](https://console.deepgram.com/signup) | $200 sign-up credit |

Known trade-offs of the free setup: Gemini's free-tier limits are unpublished (shown per project in AI Studio), and free-tier prompts may be used by Google to improve its products.

## Future scope

**Engines / free credits** (Cue needs a new engine type for each before these work):
- **Google Cloud Vertex AI** — top priority. New Google Cloud accounts get a $300 / 90-day trial that covers Gemini on Vertex AI (not the AI Studio API since March 2026). Same Gemini models, higher limits, prompts not used for training.
- **AWS Bedrock** — Claude models paid by AWS new-account credits (needs a card on file).
- **Azure OpenAI** — GPT models via Azure for Students (~$100, .edu email). Check first: student subscriptions have historically been blocked from Azure OpenAI.
- **Anthropic direct** — $5 sign-up credit (already supported as a paid engine).
- **Paid tiers** when needed: Gemini paid tier, OpenAI GPT-5.6 Luna, Claude Haiku/Sonnet (already supported; roughly $0.20–$0.60 per interview hour).

**Product:**
- Fully offline mode (local models) — parked: too slow on a 16 GB fanless laptop (30–45 s per answer in testing).
- Mac audio setup guide (BlackHole) built into the Connect screen.
