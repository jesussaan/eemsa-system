-- =====================================================================
-- BLINDAJE DE COSTOS — EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- Hoy cualquiera con la anon key del navegador puede leer/editar la
-- tabla de costos (formulas, tarifas, margenes) directamente.
-- A partir de aqui, solo se puede leer/escribir via /api/costos y
-- /api/finalizar-costo (usan la service role key del servidor).

alter table public.costos enable row level security;
-- Sin politicas para anon/authenticated => acceso directo denegado por defecto.
-- (El "table editor" del dashboard y tu usuario admin no se ven afectados.)

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- alter table public.costos disable row level security;
