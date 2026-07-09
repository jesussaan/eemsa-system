-- =====================================================================
-- BLINDAJE DE ESCRITURA — pedidos y fallas — EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Lectura abierta (Dashboard, Modo TV, Clientes, realtime dependen de
-- esto). Se bloquea insert/update/delete directo desde el navegador --
-- ahora todo pasa por /api/pedidos y /api/fallas (service role key).

alter table public.pedidos enable row level security;
create policy "anon_select" on public.pedidos for select to anon using (true);

alter table public.fallas enable row level security;
create policy "anon_select" on public.fallas for select to anon using (true);

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop policy if exists "anon_select" on public.pedidos;
-- alter table public.pedidos disable row level security;
-- drop policy if exists "anon_select" on public.fallas;
-- alter table public.fallas disable row level security;
