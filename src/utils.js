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

export function shortLabel(r, i, history) {
  const dt = new Date(r.fecha + 'T12:00:00');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const base = `${dt.getDate()} ${months[dt.getMonth()]}`;
  const dupes = history.slice(0, i).filter(x => x.fecha === r.fecha).length;
  return dupes > 0 ? base + ' ②' : base;
}
