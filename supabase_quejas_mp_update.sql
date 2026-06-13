-- =====================================================================
-- ACTUALIZACION MODULO "QUEJAS DE MATERIA PRIMA" — EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Columnas para los nombres de "Elaboró" y "Autorizó" (aparecen en el PDF)
alter table public.quejas_mp add column if not exists elaboro text;
alter table public.quejas_mp add column if not exists autorizo text;

-- Permitir eliminar quejas del historial (anon, igual que el resto del sistema)
drop policy if exists "quejas_mp_delete" on public.quejas_mp;
create policy "quejas_mp_delete" on public.quejas_mp for delete using (true);

-- Permitir borrar las fotos de evidencia del bucket al eliminar una queja
drop policy if exists "quejas_storage_delete" on storage.objects;
create policy "quejas_storage_delete" on storage.objects for delete
  using (bucket_id = 'quejas');


-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- drop policy if exists "quejas_mp_delete" on public.quejas_mp;
-- drop policy if exists "quejas_storage_delete" on storage.objects;
-- alter table public.quejas_mp drop column if exists elaboro;
-- alter table public.quejas_mp drop column if exists autorizo;
