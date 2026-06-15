export function setSyncState(state, label) {
  const dot = document.getElementById('sync-dot');
  const lbl = document.getElementById('sync-label');
  if (dot) dot.className = `sync-dot ${state}`;
  if (lbl) lbl.textContent = label;
}
