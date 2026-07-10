-- =====================================================================
-- BLINDAJE — plantillas y prod_diaria — EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- plantillas: solo la usa Pedidos.js dentro de Supervisor. Se bloquea
-- por completo (lectura y escritura) -- ahora todo pasa por
-- /api/plantillas (token de supervisor + service role key).
alter table public.plantillas enable row level security;
-- Sin politicas para anon => acceso directo denegado por defecto.

-- prod_diaria: se lee en Dashboard/Modo TV/App.js, se queda abierta a
-- lectura. Solo se bloquea insert/update/delete -- ahora pasa por
-- /api/prod-diaria (token de supervisor).
alter table public.prod_diaria enable row level security;
create policy "anon_select" on public.prod_diaria for select to anon using (true);

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- alter table public.plantillas disable row level security;
-- drop policy if exists "anon_select" on public.prod_diaria;
-- alter table public.prod_diaria disable row level security;
