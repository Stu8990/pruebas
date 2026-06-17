import { db } from './auth.js';

export const SessionRepo = {
  findByUser(userId) {
    return db
      .from('sessions')
      .select('fecha,fase,valor_total_usd,rendimientos')
      .eq('user_id', userId)
      .order('fecha',      { ascending: true })
      .order('created_at', { ascending: true });
  },
  insert(rows)        { return db.from('sessions').insert(rows); },
  insertOne(row)      { return db.from('sessions').insert(row);  },
  deleteByUser(userId){ return db.from('sessions').delete().eq('user_id', userId); },
};
