export const $f  = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' });
export const pct = v => (v===null||v===undefined||isNaN(v)) ? 'N/D' : `${+v>=0?'+':''}${(+v).toFixed(2)}%`;
export const pp  = v => (v===null||isNaN(v))                ? 'N/D' : `${+v>=0?'+':''}${(+v).toFixed(2)} pp`;

export function set(id, txt) { const e=document.getElementById(id); if(e) e.textContent=txt; }
export function val(id, v)   { const e=document.getElementById(id); if(e) e.value=v; }

export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3400);
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createCache(key, ttlMs) {
  return {
    get()  { try { const r = JSON.parse(localStorage.getItem(key)||'null'); return r && Date.now()-r.ts < ttlMs ? r.data : null; } catch { return null; } },
    set(d) { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: d })); },
    del()  { localStorage.removeItem(key); },
  };
}

export function attachTickerSearch(inputEl, fetchSuggestions, onSelect) {
  let _timer  = null;
  let _drop   = null;

  function _close() {
    if (_drop) { _drop.remove(); _drop = null; }
  }

  function _render(results) {
    _close();
    if (!results.length) return;

    _drop = document.createElement('div');
    _drop.className = 'ticker-dropdown';

    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'ticker-dropdown-item';
      item.innerHTML =
        `<span class="tdi-ticker">${esc(r.ticker)}</span>` +
        `<span class="tdi-name">${esc(r.name)}</span>` +
        `<span class="tdi-exch">${esc(r.exchange ?? '')}</span>`;
      item.addEventListener('mousedown', e => {
        e.preventDefault();
        inputEl.value = r.ticker;
        onSelect?.(r);
        _close();
      });
      _drop.appendChild(item);
    });

    const rect = inputEl.getBoundingClientRect();
    Object.assign(_drop.style, {
      position: 'fixed',
      top:  (rect.bottom + 4) + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      zIndex: '9999',
    });
    document.body.appendChild(_drop);
  }

  inputEl.addEventListener('input', () => {
    clearTimeout(_timer);
    const q = inputEl.value.trim();
    if (q.length < 2) { _close(); return; }
    _timer = setTimeout(async () => {
      try { _render(await fetchSuggestions(q)); } catch { _close(); }
    }, 380);
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') { _close(); return; }
    if (!_drop) return;
    const items = [..._drop.querySelectorAll('.ticker-dropdown-item')];
    const cur   = _drop.querySelector('.tdi-active');
    const idx   = cur ? items.indexOf(cur) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cur?.classList.remove('tdi-active');
      items[Math.min(idx + 1, items.length - 1)]?.classList.add('tdi-active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cur?.classList.remove('tdi-active');
      items[Math.max(idx - 1, 0)]?.classList.add('tdi-active');
    } else if (e.key === 'Enter') {
      const active = _drop.querySelector('.tdi-active');
      if (active) { e.preventDefault(); active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); }
    }
  });

  inputEl.addEventListener('blur', () => setTimeout(_close, 160));
  window.addEventListener('scroll', _close, { passive: true, once: false });
  window.addEventListener('resize', _close, { passive: true, once: false });
}

export function shortLabel(r, i, history) {
  const dt = new Date(r.fecha + 'T12:00:00');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const base = `${dt.getDate()} ${months[dt.getMonth()]}`;
  const dupes = history.slice(0, i).filter(x => x.fecha === r.fecha).length;
  return dupes > 0 ? base + ' ②' : base;
}
