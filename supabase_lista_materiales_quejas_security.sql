-- =====================================================================
-- Seguridad Fase 3: bloquear escritura en lista_materiales y quejas_mp
-- EEMSA System — Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- lista_materiales: se lee en Modo Emilio y App.js (realtime), se queda
-- abierta a lectura. Insert/update/delete ahora solo pasan por
-- /api/lista-materiales (service role key). Modo Emilio no tiene PIN,
-- así que ese endpoint no exige token -- el punto es cerrar el acceso
-- directo a la tabla vía la anon key, no agregar login a Emilio.
alter table public.lista_materiales enable row level security;
create policy "anon_select" on public.lista_materiales for select to anon using (true);

-- quejas_mp: solo se usa dentro de Refacciones.js en Modo Supervisor.
-- Las políticas abiertas de insert/update/delete que se crearon en
-- supabase_quejas_mp.sql / supabase_quejas_mp_update.sql se retiran --
-- ahora todo pasa por /api/quejas-mp (token de supervisor + service role).
-- La lectura se queda abierta (historial, folios consecutivos).
drop policy if exists "quejas_mp_insert" on public.quejas_mp;
drop policy if exists "quejas_mp_update" on public.quejas_mp;
drop policy if exists "quejas_mp_delete" on public.quejas_mp;

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop policy if exists "anon_select" on public.lista_materiales;
-- alter table public.lista_materiales disable row level security;
-- create policy "quejas_mp_insert" on public.quejas_mp for insert with check (true);
-- create policy "quejas_mp_update" on public.quejas_mp for update using (true);
-- create policy "quejas_mp_delete" on public.quejas_mp for delete using (true);
