# Cue

A private, self-hosted AI copilot for interviews and calls (Electron). Your data stays on your computer; API keys are encrypted with your OS keychain.

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
