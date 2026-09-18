-- InvestSmart · Migración OPCIONAL (no se ejecuta sola).
-- Garantiza en la base "un registro por día y usuario". La app ya evita
-- duplicarlos, pero dos pestañas o dispositivos guardando en el mismo segundo
-- podrían crear dos filas; con este índice la segunda falla y la app avisa.
--
-- Cómo: Supabase → SQL Editor → New query → pegar y ejecutar.
-- Haz antes una copia: Más → «Descargar mis datos» en la app.

begin;

-- 1) Quita duplicados existentes. Por usuario y fecha se queda UNA fila:
--    primero cualquier registro que NO sea automático (manual o de versiones
--    anteriores, que puede llevar _capitalInjected); entre iguales, la más reciente.
delete from sessions s
using sessions keep
where s.user_id = keep.user_id
  and s.fecha = keep.fecha
  and s.id <> keep.id
  and ((coalesce(keep.fase, '') <> 'Registro automático')::int, coalesce(keep.created_at, '-infinity'), keep.id)
    > ((coalesce(s.fase, '') <> 'Registro automático')::int, coalesce(s.created_at, '-infinity'), s.id);

-- 2) Impide nuevos duplicados.
create unique index if not exists uq_sessions_user_fecha on sessions(user_id, fecha);

commit;
