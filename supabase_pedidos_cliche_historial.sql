-- =====================================================================
-- Portacliché/diseño en el pedido + backfill de largo/ancho — EEMSA System
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1) Columnas nuevas para guardar lo que hoy se calcula y se tira: el
--    portacliché (cm) y el diseño/cobertura usados al finalizar en Modo
--    Operador (CalculadoraProduccion.js). "2" es para el 2do color, igual
--    que color2/tinta_kg2. Sin datos historicos -- eso solo lo sabia
--    Produccion en el momento y nunca se guardo, no hay nada que rescatar.
alter table public.pedidos add column if not exists diseno text;
alter table public.pedidos add column if not exists portaliche numeric;
alter table public.pedidos add column if not exists diseno2 text;
alter table public.pedidos add column if not exists portaliche2 numeric;

-- 2) Backfill de largo/ancho: pedidos creados desde Ventas nunca guardaron
--    estos dos campos aparte, solo "medida" (ej. 2"x100). Se sacan del texto
--    con la misma regla que ya usa normalizarMedida()/anchoDePedido() en el
--    codigo (primer numero = ancho, segundo = largo). Solo llena huecos
--    (where ancho/largo is null) -- nunca pisa un valor que ya exista.

-- Preview antes de escribir nada -- correr esto primero y revisar:
-- select id, cliente, medida, ancho, largo,
--        (regexp_match(medida, '^\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)'))[1] as ancho_nuevo,
--        (regexp_match(medida, '^\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)'))[2] as largo_nuevo
-- from public.pedidos
-- where (ancho is null or largo is null) and medida is not null;

update public.pedidos
set ancho = (regexp_match(medida, '^\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)'))[1]
where ancho is null
  and medida is not null
  and medida ~ '^\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)';

update public.pedidos
set largo = (regexp_match(medida, '^\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)'))[2]::numeric
where largo is null
  and medida is not null
  and medida ~ '^\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)';

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- alter table public.pedidos drop column if exists diseno;
-- alter table public.pedidos drop column if exists portaliche;
-- alter table public.pedidos drop column if exists diseno2;
-- alter table public.pedidos drop column if exists portaliche2;
-- -- El backfill de ancho/largo no tiene rollback automatico (no se guarda
-- -- el valor "antes"); si hace falta deshacerlo, hay que poner NULL a mano
-- -- en los ids que aparecieron en el preview de arriba.
