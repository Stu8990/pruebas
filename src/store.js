import { ASSETS } from './config.js';
import { SessionRepo } from './repository.js';
import { setSyncState } from './sync.js';
import { toast } from './utils.js';

const LEGACY_KEYS = ['investsmart-v3', 'investsmart-v4', 'investsmart-v2'];

export const Store = {
  history: [], idx: 0, userId: null,

  load(userId) {
    this.userId = userId;
    this._loadFallback();
    this.idx = this.history.length - 1;
  },

  async _syncCloud() {
    setSyncState('busy', 'Sincronizando…');
    try {
      const { data, error } = await SessionRepo.findByUser(this.userId);
      if (error) {
        if (error.code === '42P01') {
          toast('⚠️ Configuración pendiente. Contacta al administrador.');
          setSyncState('err', 'Error de configuración');
          return false;
        }
        throw error;
      }
      if (data && data.length > 0) {
        this.history = data;
        this.idx = this.history.length - 1;
        setSyncState('ok', 'Sincronizado');
        return true;
      } else {
        await this._seedInitialData(this.userId);
        setSyncState('ok', 'Datos iniciales cargados');
        return true;
      }
    } catch (err) {
      setSyncState('err', 'Sin conexión');
      return false;
    }
  },

  async _seedInitialData(userId) {
    let source = null;
    for (const k of LEGACY_KEYS) {
      const s = localStorage.getItem(k);
      if (s) { try { source = JSON.parse(s); break; } catch {} }
    }
    if (!source) { this.history = []; return; }
    this.history = source;
    const rows = this.history.map(r => ({
      user_id: userId, fecha: r.fecha, fase: r.fase || '',
      valor_total_usd: r.valor_total_usd, rendimientos: r.rendimientos,
    }));
    const { error } = await SessionRepo.insert(rows);
    if (error) console.error('Seed error:', error.code, error.message);
  },

  _loadFallback() {
    for (const k of LEGACY_KEYS) {
      const s = localStorage.getItem(k);
      if (s) { try { this.history = JSON.parse(s); return; } catch {} }
    }
    this.history = [];
  },

  async add(r) {
    setSyncState('busy', 'Guardando…');
    const { error } = await SessionRepo.insertOne({
      user_id: this.userId, fecha: r.fecha, fase: r.fase,
      valor_total_usd: r.valor_total_usd, rendimientos: r.rendimientos,
    });
    if (error) {
      setSyncState('err', 'Error al guardar');
      toast('⚠️ Error al guardar. Intenta de nuevo.');
      return false;
    }
    this.history.push(r);
    this.history.sort((a, b) => a.fecha !== b.fecha ? new Date(a.fecha) - new Date(b.fecha) : 0);
    this.idx = this.history.length - 1;
    setSyncState('ok', 'Guardado en la nube');
    return true;
  },

  async reset(userId) {
    setSyncState('busy', 'Borrando registros…');
    await SessionRepo.deleteByUser(userId);
    this.history = [];
    this.idx = 0;
    setSyncState('ok', 'Registros borrados');
  },

  cur()  { return this.history[this.idx] || this.history.at(-1); },
  prev() { return this.idx > 0 ? this.history[this.idx - 1] : null; },

  avg(r, keys) {
    const v = keys.map(k => r.rendimientos[k]).filter(x => x !== null && x !== undefined && !isNaN(x));
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  },

  delta(a, c, p) {
    if (!p) return null;
    const n = c.rendimientos[a], b = p.rendimientos[a];
    return (n === null || n === undefined || b === null || b === undefined) ? null : n - b;
  },
};
