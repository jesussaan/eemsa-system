-- =====================================================================
-- Seguridad Fase 5: bloquear subida directa en buckets "cliches" y
-- "refacciones" -- EEMSA System. Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Estos dos buckets no tienen un archivo .sql propio en el repo (se
-- crearon desde el dashboard de Supabase), asi que no sabemos de
-- antemano el nombre exacto de sus politicas. Este bloque las busca
-- automaticamente por el bucket_id que protegen y las borra -- ya no
-- hace falta, porque ahora la subida pasa por /api/storage-upload-url
-- (signed URL) en vez de la anon key directo.

-- Paso 1 (opcional, solo para ver que se va a borrar antes de correr el paso 2):
-- select policyname, cmd, qual, with_check from pg_policies
-- where schemaname = 'storage' and tablename = 'objects'
--   and (qual ilike '%cliches%' or with_check ilike '%cliches%'
--     or qual ilike '%refacciones%' or with_check ilike '%refacciones%');

-- Paso 2: borrar las politicas de INSERT (subida) que mencionen estos buckets.
-- La lectura se queda abierta (getPublicUrl/createSignedUrl para ver las fotos).
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and cmd = 'INSERT'
      and (qual ilike '%cliches%' or with_check ilike '%cliches%'
        or qual ilike '%refacciones%' or with_check ilike '%refacciones%')
  loop
    execute format('drop policy %I on storage.objects', pol.policyname);
    raise notice 'Borrada politica: %', pol.policyname;
  end loop;
end $$;

-- =====================================================================
-- ROLLBACK (si algo se rompe)
-- =====================================================================
-- No se puede deshacer automaticamente porque las politicas se borraron
-- dinamicamente sin guardar su definicion exacta. Si algo truena:
--   1) Vuelve a habilitar subida directa mientras se investiga:
--      create policy "cliches_insert_temp" on storage.objects for insert
--        with check (bucket_id = 'cliches');
--      create policy "refacciones_insert_temp" on storage.objects for insert
--        with check (bucket_id = 'refacciones');
--   2) Avisa para revisar que el endpoint /api/storage-upload-url
--      este funcionando (variable SUPABASE_SERVICE_KEY configurada en Vercel).
