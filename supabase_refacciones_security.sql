-- =====================================================================
-- BLINDAJE DE ESCRITURA — refacciones y proveedores — EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Estas dos tablas se siguen leyendo con la anon key (Dashboard, App.js,
-- realtime) así que la LECTURA se queda abierta. Lo que se bloquea es
-- insert/update/delete directo desde el navegador -- eso ahora solo pasa
-- por /api/refacciones y /api/proveedores (service role + token de
-- supervisor).

alter table public.refacciones enable row level security;
create policy "anon_select" on public.refacciones for select to anon using (true);

alter table public.proveedores enable row level security;
create policy "anon_select" on public.proveedores for select to anon using (true);

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop policy if exists "anon_select" on public.refacciones;
-- alter table public.refacciones disable row level security;
-- drop policy if exists "anon_select" on public.proveedores;
-- alter table public.proveedores disable row level security;
