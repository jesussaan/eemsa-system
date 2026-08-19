-- =====================================================================
-- MODULO "INVENTARIO DE MATERIA PRIMA" — EEMSA System
-- Ejecutar TODO este archivo de una sola vez en el SQL Editor de Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabla materiales (catalogo + stock actual)
-- ---------------------------------------------------------------------
create table if not exists public.materiales (
  id text primary key,
  created date not null default current_date,
  nombre text not null,
  unidad text not null default 'Pieza',
  stock numeric not null default 0,
  stock_min numeric not null default 0,
  costo_unitario numeric,
  notas text
);

create index if not exists materiales_nombre_idx on public.materiales (nombre);

-- Igual que refacciones: lectura abierta con la anon key (Dashboard,
-- realtime), escritura solo via /api/inventario (service role + token de
-- supervisor).
alter table public.materiales enable row level security;
drop policy if exists "anon_select" on public.materiales;
create policy "anon_select" on public.materiales for select to anon using (true);

-- ---------------------------------------------------------------------
-- 2) Tabla movimientos_inventario_mp (historial de entradas/salidas)
-- ---------------------------------------------------------------------
-- "tipo" incluye 'salida' pensando en el descuento automatico desde una
-- corrida de produccion (fase futura) -- por ahora el modulo de Inventario
-- solo deja registrar 'entrada' desde la pantalla.
create table if not exists public.movimientos_inventario_mp (
  id bigint generated always as identity primary key,
  created timestamptz not null default now(),
  material_id text not null references public.materiales(id) on delete cascade,
  material_nombre text not null,
  tipo text not null check (tipo in ('entrada','salida')),
  cantidad numeric not null check (cantidad > 0),
  motivo text,
  usuario_email text
);

create index if not exists movimientos_inv_material_idx on public.movimientos_inventario_mp (material_id);
create index if not exists movimientos_inv_created_idx on public.movimientos_inventario_mp (created desc);

alter table public.movimientos_inventario_mp enable row level security;
drop policy if exists "anon_select" on public.movimientos_inventario_mp;
create policy "anon_select" on public.movimientos_inventario_mp for select to anon using (true);

-- ---------------------------------------------------------------------
-- 3) Consumo automatico desde produccion (Modo Operador -> "Enviar a Emilio")
-- ---------------------------------------------------------------------
-- categoria + match_valor le dicen a /api/inventario?accion=consumo-automatico
-- a que material descontarle segun el pedido que se acaba de finalizar:
--   rollo_mp  -> match_valor = tipo de cinta del pedido   (Blanca/Canela/Transparente/Engomado)
--   tinta     -> match_valor = color de tinta del pedido  (pedidos.color / pedidos.tinta_tipo)
--   solvente  -> un solo material, match_valor libre (no se usa para matchear)
--   otro      -> default; material fuera del auto-consumo (se maneja 100% manual)
alter table public.materiales add column if not exists categoria text not null default 'otro'
  check (categoria in ('rollo_mp','tinta','solvente','otro'));
alter table public.materiales add column if not exists match_valor text;
create index if not exists materiales_categoria_match_idx on public.materiales (categoria, match_valor);

-- origen distingue una salida capturada a mano de una que se descuenta sola
-- al finalizar un pedido; pedido_num queda para poder rastrear que corrida
-- disparo cada movimiento automatico.
alter table public.movimientos_inventario_mp add column if not exists origen text not null default 'manual'
  check (origen in ('manual','corrida_automatica'));
alter table public.movimientos_inventario_mp add column if not exists pedido_num text;

-- ---------------------------------------------------------------------
-- 4) Tarimas -- cada pallet fisico recibido, con su propio QR y lote, para
-- trazabilidad y consumo FIFO (la tarima activa mas vieja se consume
-- primero, tanto en el descuento automatico como al escanear a mano).
-- materiales.stock sigue siendo la suma de tarimas.cantidad_actual de ese
-- material -- un cache para no sumar en cada render, no la fuente de verdad.
-- ---------------------------------------------------------------------
create table if not exists public.tarimas (
  id text primary key,
  created timestamptz not null default now(),
  material_id text not null references public.materiales(id) on delete cascade,
  lote text,
  proveedor text,
  cantidad_inicial numeric not null check (cantidad_inicial > 0),
  cantidad_actual numeric not null check (cantidad_actual >= 0),
  fecha_recepcion date not null default current_date,
  activa boolean not null default true,
  notas text
);
create index if not exists tarimas_material_idx on public.tarimas (material_id);
create index if not exists tarimas_fifo_idx on public.tarimas (material_id, activa, fecha_recepcion, created);

alter table public.tarimas enable row level security;
drop policy if exists "anon_select" on public.tarimas;
create policy "anon_select" on public.tarimas for select to anon using (true);

-- set null (no cascade): si algun dia se borra una tarima a mano, el
-- historial de movimientos que ya paso por ella no debe desaparecer.
alter table public.movimientos_inventario_mp add column if not exists tarima_id text references public.tarimas(id) on delete set null;
create index if not exists movimientos_inv_tarima_idx on public.movimientos_inventario_mp (tarima_id);

-- ---------------------------------------------------------------------
-- 5) Categoria "centro" -- cores de carton para el tubo de la cinta. No
-- llegan en tarima (llegan en cajas sueltas, organizadas por ancho), pero
-- si se consumen solos: 1 core por pieza producida. match_valor = ancho del
-- pedido ("2" o "3"), ver api/inventario.js accion=consumo-automatico.
-- ---------------------------------------------------------------------
alter table public.materiales drop constraint if exists materiales_categoria_check;
alter table public.materiales add constraint materiales_categoria_check
  check (categoria in ('rollo_mp','tinta','solvente','centro','otro'));

-- ---------------------------------------------------------------------
-- 6) Numero de tarima -- secuencial POR MATERIAL (la primera tarima de
-- Blanca es #1, la primera de Canela tambien es #1), para poder identificar
-- un pallet a simple vista ("Tarima #4") ademas del QR. Se calcula en
-- api/inventario.js al crear la entrada; aqui solo se numeran las que ya
-- existian antes de este cambio, por orden de llegada.
-- ---------------------------------------------------------------------
alter table public.tarimas add column if not exists numero integer;
with numeradas as (
  select id, row_number() over (partition by material_id order by created) as rn
  from public.tarimas
)
update public.tarimas t set numero = n.rn
from numeradas n
where t.id = n.id and t.numero is null;

-- ---------------------------------------------------------------------
-- 7) FIX: las politicas de lectura solo cubrian el rol "anon" (visitas sin
-- sesion). Cualquier usuario CON sesion iniciada consulta como rol
-- "authenticated", que es un rol distinto en Postgres -- no hereda "anon" --
-- asi que para todo mundo logueado (osea, todo mundo que de verdad usa la
-- app) materiales/tarimas/movimientos_inventario_mp se veian vacios aunque
-- el dato si estuviera en la base. Se agrega "authenticated" a las 3
-- politicas para cubrir ambos casos.
-- ---------------------------------------------------------------------
drop policy if exists "anon_select" on public.materiales;
create policy "anon_select" on public.materiales for select to anon, authenticated using (true);

drop policy if exists "anon_select" on public.movimientos_inventario_mp;
create policy "anon_select" on public.movimientos_inventario_mp for select to anon, authenticated using (true);

drop policy if exists "anon_select" on public.tarimas;
create policy "anon_select" on public.tarimas for select to anon, authenticated using (true);

-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- alter table public.tarimas drop column if exists numero;
-- alter table public.materiales drop constraint if exists materiales_categoria_check;
-- alter table public.materiales add constraint materiales_categoria_check check (categoria in ('rollo_mp','tinta','solvente','otro'));
-- alter table public.movimientos_inventario_mp drop column if exists tarima_id;
-- drop table if exists public.tarimas;
-- alter table public.movimientos_inventario_mp drop column if exists pedido_num;
-- alter table public.movimientos_inventario_mp drop column if exists origen;
-- alter table public.materiales drop column if exists match_valor;
-- alter table public.materiales drop column if exists categoria;
-- drop table if exists public.movimientos_inventario_mp;
-- drop table if exists public.materiales;
