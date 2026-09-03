-- =====================================================================
-- COLUMNA "pausas" en pedidos -- registro de pausas manuales durante
-- "en proceso" (operador ausente, maquina apagada, etc.), para no
-- cargarle esas horas muertas al costo fijo del pedido. Ejecutar en el
-- SQL Editor de Supabase.
-- =====================================================================

alter table public.pedidos add column if not exists pausas jsonb not null default '[]'::jsonb;

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- alter table public.pedidos drop column if exists pausas;
