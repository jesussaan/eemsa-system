-- =====================================================================
-- BLINDAJE DE ESCRITURA — cliches (vida util) — EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- La tabla se sigue leyendo con la anon key (Dashboard, App.js, realtime)
-- asi que la LECTURA se queda abierta. La ESCRITURA (crear/sumar/cerrar
-- un cliche) solo pasa por /api/cliches (service role + sesion de
-- Operador/Emilio).

alter table public.cliches enable row level security;
create policy "anon_select" on public.cliches for select to anon using (true);

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop policy if exists "anon_select" on public.cliches;
-- alter table public.cliches disable row level security;
