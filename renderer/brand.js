// Brand: change NAME / MARK here to rename + re-logo the whole app (widget, bubble, dashboard, window titles use this).
const BRAND = { name: 'Cue', suffix: 'AI', mark: 'ring' };

const MARKS = {
  // gradient ids are prefixed per instance so several logos can live on one page
  bubble: (u) => `<defs><linearGradient id="${u}" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#7C6CFF"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs>
    <path d="M32 8c13.3 0 24 9.2 24 20.5S45.3 49 32 49c-2.6 0-5-.3-7.3-1L13 54l2.6-10.2C11.6 40.3 8 34.8 8 28.5 8 17.2 18.7 8 32 8z" fill="url(#${u})"/>
    <path d="M32 17l2.8 7.7L42.5 27.5l-7.7 2.8L32 38l-2.8-7.7L21.5 27.5l7.7-2.8z" fill="#fff"/>`,
  wave: (u) => `<defs><linearGradient id="${u}" x1="0" y1="8" x2="0" y2="56"><stop stop-color="#34D399"/><stop offset="1" stop-color="#3B82F6"/></linearGradient></defs>
    <g fill="url(#${u})"><rect x="8" y="24" width="7" height="16" rx="3.5"/><rect x="18.5" y="14" width="7" height="36" rx="3.5"/><rect x="29" y="6" width="7" height="52" rx="3.5"/><rect x="39.5" y="18" width="7" height="28" rx="3.5"/><rect x="50" y="26" width="7" height="12" rx="3.5"/></g>`,
  ring: (u) => `<defs><linearGradient id="${u}" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#8B7CFF"/><stop offset="1" stop-color="#38BDF8"/></linearGradient></defs>
    <path d="M46.1 17.9A20 20 0 1 0 46.1 46.1" fill="none" stroke="url(#${u})" stroke-width="8.5" stroke-linecap="round"/><circle cx="51" cy="32" r="5.5" fill="url(#${u})"/>`,
  hush: (u) => `<defs><linearGradient id="${u}" x1="8" y1="8" x2="56" y2="56"><stop stop-color="#A78BFA"/><stop offset="1" stop-color="#F472B6"/></linearGradient></defs>
    <g fill="none" stroke="url(#${u})" stroke-width="5" stroke-linecap="round"><path d="M28.4 24.3A10 10 0 0 1 28.4 39.7"/><path d="M34.2 17.4A19 19 0 0 1 34.2 46.6" opacity=".62"/><path d="M40 10.5A28 28 0 0 1 40 53.5" opacity=".32"/></g><circle cx="13" cy="32" r="5.5" fill="url(#${u})"/>`,
  nudge: (u) => `<defs><linearGradient id="${u}" x1="4" y1="4" x2="60" y2="60"><stop stop-color="#6366F1"/><stop offset="1" stop-color="#A855F7"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#${u})"/><path d="M22 16l1 29 7.5-7 5.5 11.5 5-2.4-5.5-11 10 .4z" fill="#fff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`,
  lumen: (u) => `<defs><linearGradient id="${u}" x1="10" y1="6" x2="54" y2="58"><stop stop-color="#FDE68A"/><stop offset=".55" stop-color="#FB923C"/><stop offset="1" stop-color="#F43F5E"/></linearGradient></defs>
    <path d="M32 4C34.4 21 43 29.6 60 32 43 34.4 34.4 43 32 60 29.6 43 21 34.4 4 32 21 29.6 29.6 21 32 4z" fill="url(#${u})"/>`,
  sidekick: (u) => `<defs><linearGradient id="${u}a" x1="8" y1="16" x2="40" y2="48"><stop stop-color="#38BDF8"/><stop offset="1" stop-color="#6366F1"/></linearGradient><linearGradient id="${u}b" x1="24" y1="16" x2="56" y2="48"><stop stop-color="#F472B6"/><stop offset="1" stop-color="#FB923C"/></linearGradient></defs>
    <circle cx="23" cy="32" r="17" fill="url(#${u}a)"/><circle cx="41" cy="32" r="17" fill="url(#${u}b)" opacity=".92"/><path d="M32 18.2a17 17 0 0 1 0 27.6 17 17 0 0 1 0-27.6z" fill="#fff" opacity=".9"/>`,
  poise: (u) => `<defs><linearGradient id="${u}" x1="4" y1="4" x2="60" y2="60"><stop stop-color="#14B8A6"/><stop offset="1" stop-color="#3B82F6"/></linearGradient></defs>
    <rect x="4" y="4" width="56" height="56" rx="18" fill="url(#${u})"/><path fill="#fff" fill-rule="evenodd" d="M21 15h14.5a12.5 12.5 0 0 1 0 25H29.5v9H21zM29.5 22.5v10.5h6a5.25 5.25 0 0 0 0-10.5z"/><circle cx="46" cy="47" r="3.2" fill="#fff" opacity=".85"/>`,
};
let _u = 0;
const mark = (key = BRAND.mark, size = 24) => `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-label="${BRAND.name}">${MARKS[key]('g' + ++_u + key)}</svg>`;
if (typeof document !== 'undefined') document.title = `${BRAND.name} ${BRAND.suffix}`.trim();
if (typeof module !== 'undefined') module.exports = { BRAND, MARKS };
