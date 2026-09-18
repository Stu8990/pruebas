// Hoja inferior (bottom sheet). En móvil sube desde abajo; en escritorio es un
// diálogo centrado. Usa <dialog> nativo: foco atrapado, Escape y capa de fondo
// vienen del navegador.

let dialog = null;
let onCloseCb = null;

function ensure() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  dialog.setAttribute('aria-labelledby', 'sheet-title');
  dialog.innerHTML = `
    <div class="sheet__grip" aria-hidden="true"></div>
    <header class="sheet__head">
      <h2 id="sheet-title" class="sheet__title" tabindex="-1"></h2>
      <button type="button" class="icon-btn" data-sheet-close aria-label="Cerrar">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </header>
    <div class="sheet__body"></div>`;
  dialog.addEventListener('click', e => {
    if (e.target === dialog || e.target.closest('[data-sheet-close]')) closeSheet();
  });
  dialog.addEventListener('close', () => { const cb = onCloseCb; onCloseCb = null; cb?.(); });
  document.body.appendChild(dialog);
  return dialog;
}

export function openSheet(title, html, { onClose } = {}) {
  const d = ensure();
  d.querySelector('.sheet__title').textContent = title;
  d.querySelector('.sheet__body').innerHTML = html;
  onCloseCb = onClose ?? null;
  if (!d.open) d.showModal();
  // Al reemplazar el contenido el foco quedaba en un nodo borrado: se lleva
  // al campo marcado o, si no hay, al título de la hoja.
  const first = d.querySelector('.sheet__body [autofocus]') ?? d.querySelector('.sheet__title');
  first?.focus();
  d.querySelector('.sheet__body').scrollTop = 0;
  d.scrollTop = 0;
  return d.querySelector('.sheet__body');
}

export function sheetBody() { return dialog?.querySelector('.sheet__body') ?? null; }
export function setSheetTitle(t) { if (dialog) dialog.querySelector('.sheet__title').textContent = t; }
export function closeSheet() { if (dialog?.open) dialog.close(); }
export function isSheetOpen() { return !!dialog?.open; }
