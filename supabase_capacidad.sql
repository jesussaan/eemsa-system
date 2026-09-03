-- =====================================================================
-- TABLA "capacidad" -- tiempos estandar / capacidad teorica por linea
-- (Cintas SIAT L36, Engomado, Rebobinado). Ejecutar en el SQL Editor de
-- Supabase.
-- =====================================================================

create table if not exists public.capacidad (
  key   text primary key,
  valor numeric not null
);

-- Igual que costos (ver supabase_costos_security.sql): solo se lee/escribe
-- via /api/capacidad (service role key del servidor) -- sin politicas para
-- anon/authenticated, acceso directo denegado por defecto desde el arranque
-- (a diferencia de costos, que empezo abierta y se tuvo que cerrar despues).
alter table public.capacidad enable row level security;

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- drop table if exists public.capacidad;
