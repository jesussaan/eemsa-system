-- Pedido urgente: Ventas lo marca al capturarlo (ver ModoVentas.js) y se ve
-- como "URGENTE" en Modo Operador, la pizarra y la agenda. El programa de
-- produccion (src/lib/entregas.js) lo adelanta solo lo necesario para llegar
-- a la fecha que pidio el cliente.
--   prioridad = 'urgente' | null
-- La pizarra publica (anon) tambien lo lee -- se agrega a sus columnas
-- permitidas (ver supabase_seguridad_fase1.sql y PEDIDOS_COLUMNAS_PUBLICAS).
alter table public.pedidos add column if not exists prioridad text;
grant select (prioridad) on public.pedidos to anon;
