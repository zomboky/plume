// Icônes SVG dessinées pour Plume (trait 1.5, 16×16, couleur courante).
const svg = (body: string) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const icons = {
  cut: svg('<circle cx="4.5" cy="12" r="2"/><circle cx="11.5" cy="12" r="2"/><path d="M6 10.5 12 2M10 10.5 4 2"/>'),
  copy: svg('<rect x="5.5" y="5.5" width="8" height="8.5" rx="1.5"/><path d="M10.5 5.5V3.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3.5v6A1.5 1.5 0 0 0 4 11h1.5"/>'),
  paste: svg('<rect x="3" y="3" width="10" height="11.5" rx="1.5"/><path d="M6 3V2h4v1"/><path d="M5.5 7.5h5M5.5 10.5h3.5"/>'),
  trash: svg('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/>'),
  bold: svg('<path d="M4.5 2.5h4.25a2.75 2.75 0 0 1 0 5.5H4.5zM4.5 8h5a2.75 2.75 0 0 1 0 5.5h-5z"/>'),
  italic: svg('<path d="M7 2.5h5M4 13.5h5M10 2.5 6.5 13.5"/>'),
  code: svg('<path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>'),
  link: svg('<path d="M6.8 9.2a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.9.9"/><path d="M9.2 6.8a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.9-.9"/>'),
  quote: svg('<path d="M3 7.5V11h3.5V7.5H4.2c0-1.8.8-2.8 2.3-3.2M9.5 7.5V11H13V7.5h-2.3c0-1.8.8-2.8 2.3-3.2"/>'),
  ol: svg('<path d="M6.5 4h7M6.5 8h7M6.5 12h7"/><path d="M2.5 3 3.5 2.5V6M2.3 9.2c.4-.6 1.8-.6 1.8.3 0 .7-1.8 1.4-1.8 2h1.9" stroke-width="1.1"/>'),
  ul: svg('<path d="M6 4h7.5M6 8h7.5M6 12h7.5"/><circle cx="3" cy="4" r=".8" fill="currentColor"/><circle cx="3" cy="8" r=".8" fill="currentColor"/><circle cx="3" cy="12" r=".8" fill="currentColor"/>'),
  task: svg('<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="m5.3 8.2 1.9 1.9 3.6-4"/>'),
  codeBlock: svg('<rect x="1.8" y="2.5" width="12.4" height="11" rx="1.6"/><path d="m6 6.3-1.8 1.7L6 9.7M10 6.3l1.8 1.7L10 9.7"/>'),
  plus: svg('<path d="M8 3v10M3 8h10"/>'),
  chevronLeft: svg('<path d="m10 3.5-4.5 4.5 4.5 4.5"/>'),
  chevronRight: svg('<path d="m6 3.5 4.5 4.5-4.5 4.5"/>'),
  folder: svg('<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z"/>'),
  file: svg('<path d="M4 1.8h5l3 3v9.4H4z"/><path d="M9 1.8v3h3"/>'),
  close: svg('<path d="m4 4 8 8M12 4l-8 8"/>'),
  up: svg('<path d="m4 10 4-4 4 4"/>'),
  down: svg('<path d="m4 6 4 4 4-4"/>')
}
