-- =====================================================================
-- Seguridad Fase 4: bloquear escritura directa en el bucket "quejas"
-- EEMSA System — Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Hasta ahora cualquiera con la anon key podía subir o borrar archivos
-- en el bucket "quejas" directamente. A partir de aquí:
--   - Subir: el navegador pide una signed upload URL a
--     /api/quejas-mp-upload-url (token de supervisor + service role),
--     y sube el archivo con esa URL firmada (no requiere la política
--     de insert de abajo).
--   - Borrar: ahora lo hace /api/quejas-mp (DELETE) con la service
--     role key, al eliminar la queja en la base de datos.
-- La lectura se queda abierta (el bucket es público, las fotos se
-- muestran directo por URL).

drop policy if exists "quejas_storage_insert" on storage.objects;
drop policy if exists "quejas_storage_delete" on storage.objects;

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- create policy "quejas_storage_insert" on storage.objects for insert
--   with check (bucket_id = 'quejas');
-- create policy "quejas_storage_delete" on storage.objects for delete
--   using (bucket_id = 'quejas');
