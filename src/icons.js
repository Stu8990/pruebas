// Sistema de iconos. Un solo trazo (2px), una sola rejilla (24x24) y
// currentColor en todos, para que hereden el color del contenedor y
// funcionen igual en tema claro y oscuro.
//
// Sustituye a los emoji que hacían de icono: un emoji lo dibuja el sistema
// operativo, así que cambia de forma, de color y de peso entre Android, iOS
// y escritorio, y nunca coincide con los SVG que ya usaba la app.

const P = {
  chart:      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  trending:   '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  book:       '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  clipboard:  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  search:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  brain:      '<path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3 3 3 0 0 0 .5 1.6A3 3 0 0 0 6 14a3 3 0 0 0 3 3v1a3 3 0 0 0 6 0v-1a3 3 0 0 0 3-3 3 3 0 0 0-.5-3.4A3 3 0 0 0 18 9a3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/><line x1="12" y1="5" x2="12" y2="18"/>',
  rocket:     '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2 2 0 0 0-2.9-.1z"/><path d="M12 15l-3-3a20 20 0 0 1 2-3.9A12.4 12.4 0 0 1 22 2c0 2.9-.8 8-6 12a20 20 0 0 1-4 1z"/><path d="M9 12H5s.5-2.5 2-3.5C8.6 7.4 11 8 11 8"/>',
  wallet:     '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  trophy:     '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M6 2h12v7a6 6 0 0 1-12 0V2z"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="22" x2="16" y2="22"/><line x1="12" y1="19" x2="12" y2="22"/>',
  target:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  sprout:     '<path d="M12 22V11"/><path d="M12 11C12 7 9 4 5 4c0 4 3 7 7 7z"/><path d="M12 13c0-3.3 2.7-6 6-6 0 3.3-2.7 6-6 6z"/>',
  calendar:   '<rect x="3" y="5" width="18" height="16" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  bot:        '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1.5"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
  settings:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H7a1.7 1.7 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V7a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bolt:       '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  wave:       '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8"/>',
  refresh:    '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  close:      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  note:       '<path d="M11 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  cycle:      '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
};

export function icon(name, size = 18) {
  const d = P[name];
  if (!d) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
       + `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

export const ICON_NAMES = Object.keys(P);
