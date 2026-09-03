-- =====================================================================
-- TABLA "clientes_disenos" -- foto de referencia del diseno actual de
-- cada cliente (modulo Clientes). Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

create table if not exists public.clientes_disenos (
  id         text primary key,
  cliente    text not null unique,
  foto_path  text not null,
  updated_at timestamptz not null default now()
);

-- Lectura abierta (igual que cliches, ver supabase_cliches_rls_fix.sql) --
-- es solo una foto de referencia, no dato sensible, y App.js la carga con
-- la anon key igual que el resto de las tablas. Escritura solo via
-- /api/registro?tabla=clientes-disenos (service role key del servidor).
alter table public.clientes_disenos enable row level security;
create policy "clientes_disenos_select_todos" on public.clientes_disenos for select using (true);

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop table if exists public.clientes_disenos;
