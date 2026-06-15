let _client = null;

export function setDbClient(client) { _client = client; }

export const SessionRepo = {
  findByUser(userId) {
    return _client
      .from('sessions')
      .select('fecha,fase,valor_total_usd,rendimientos')
      .eq('user_id', userId)
      .order('fecha',      { ascending: true })
      .order('created_at', { ascending: true });
  },
  insert(rows)  { return _client.from('sessions').insert(rows); },
  insertOne(row){ return _client.from('sessions').insert(row);  },
  deleteByUser(userId) { return _client.from('sessions').delete().eq('user_id', userId); },
};
