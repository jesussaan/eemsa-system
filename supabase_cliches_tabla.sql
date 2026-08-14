-- =====================================================================
-- Tabla cliches: vida util de un cliche (placa de impresion) a traves de
-- multiples pedidos -- EEMSA System. Ejecutar en el SQL Editor de Supabase.
--
-- Ojo: esto NO es lo mismo que el bucket de storage "cliches" (fotos de
-- diseno/portacliche, ver supabase_cliches_refacciones_storage_security.sql
-- y ModoOperador.js) -- son namespaces distintos en Supabase (tabla vs
-- storage), coinciden en nombre porque describen la misma pieza fisica
-- desde dos angulos distintos (foto vs contador de uso).
--
-- Un cliche "activo" acumula cajas_acumuladas/pedidos_acumulados cada vez
-- que Modo Operador lo marca "Usado" al finalizar un pedido del mismo
-- cliente+medida+color. Cuando se marca "Nuevo" para esa misma combinacion,
-- el activo anterior se cierra (estado='cerrado', fecha_baja) con su total
-- final, y arranca uno nuevo en cero -- asi se puede medir cuanto duro.
-- =====================================================================

create table if not exists public.cliches (
  id text primary key,
  cliente text not null,
  medida text not null,
  color text,
  diseno text,
  portaliche numeric,
  cajas_acumuladas numeric not null default 0,
  pedidos_acumulados integer not null default 0,
  estado text not null default 'activo', -- 'activo' | 'cerrado'
  fecha_alta text not null,
  fecha_baja text,
  created text not null
);

-- Pedido queda ligado al cliche que se uso al finalizarlo (null si nunca
-- se marco Nuevo/Usado, ej. pedidos viejos o corridas sin cliche/clicheNA).
alter table public.pedidos
  add column if not exists cliche_id text references public.cliches(id) on delete set null;

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- alter table public.pedidos drop column if exists cliche_id;
-- drop table if exists public.cliches;
