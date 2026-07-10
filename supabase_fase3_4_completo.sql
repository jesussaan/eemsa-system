-- =====================================================================
-- Seguridad Fase 3 + Fase 4 — EEMSA System — TODO EN UNO
-- Seguro de correr aunque ya hayas ejecutado parte de esto antes.
-- Ejecutar completo en el SQL Editor de Supabase, dar RUN una vez.
-- =====================================================================

-- --- Fase 3: lista_materiales (Modo Emilio) ---------------------------
alter table public.lista_materiales enable row level security;
drop policy if exists "anon_select" on public.lista_materiales;
create policy "anon_select" on public.lista_materiales for select to anon using (true);

-- --- Fase 3: quejas_mp (Refacciones > Quejas MP) ----------------------
drop policy if exists "quejas_mp_insert" on public.quejas_mp;
drop policy if exists "quejas_mp_update" on public.quejas_mp;
drop policy if exists "quejas_mp_delete" on public.quejas_mp;

-- --- Fase 4: bucket de storage "quejas" (fotos de evidencia) ---------
drop policy if exists "quejas_storage_insert" on storage.objects;
drop policy if exists "quejas_storage_delete" on storage.objects;

-- =====================================================================
-- VERIFICACION: corre esto despues para ver que politicas quedaron
-- activas en estas tablas (deberias ver solo "anon_select" o "select").
-- =====================================================================
-- select tablename, policyname, cmd from pg_policies
-- where tablename in ('lista_materiales', 'quejas_mp', 'objects')
-- order by tablename, policyname;

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop policy if exists "anon_select" on public.lista_materiales;
-- alter table public.lista_materiales disable row level security;
-- create policy "quejas_mp_insert" on public.quejas_mp for insert with check (true);
-- create policy "quejas_mp_update" on public.quejas_mp for update using (true);
-- create policy "quejas_mp_delete" on public.quejas_mp for delete using (true);
-- create policy "quejas_storage_insert" on storage.objects for insert with check (bucket_id = 'quejas');
-- create policy "quejas_storage_delete" on storage.objects for delete using (bucket_id = 'quejas');
