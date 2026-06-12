-- =====================================================================
-- BLINDAJE PORTAL DE CLIENTES — EEMSA System
-- Ejecutar en el SQL Editor de Supabase, EN ORDEN (1 a 4).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Bloquear acceso directo a la tabla "clientes" desde la API
--    (hoy cualquiera con la anon key puede leer TODOS los portal_token)
-- ---------------------------------------------------------------------
alter table public.clientes enable row level security;
-- Sin políticas para anon/authenticated => acceso directo denegado por defecto.
-- (El "table editor" del dashboard y tu usuario admin no se ven afectados.)


-- ---------------------------------------------------------------------
-- 2) Función para el Portal: obtener el NOMBRE del cliente por su token
--    Devuelve una fila si el token existe, o ninguna si no (=> "Link no válido")
-- ---------------------------------------------------------------------
create or replace function public.portal_get_cliente(p_token text)
returns table (nombre text)
language sql
security definer
set search_path = public
as $$
  select c.nombre
  from public.clientes c
  where c.portal_token = p_token;
$$;

grant execute on function public.portal_get_cliente(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) Función para el Portal: obtener los pedidos del cliente del token,
--    SOLO columnas seguras (sin merma, notas internas, costos, etc.)
-- ---------------------------------------------------------------------
create or replace function public.portal_get_pedidos(p_token text)
returns table (
  num text,
  medida text,
  cajas numeric,
  piezas_prod numeric,
  status text,
  fecha_solicitud date,
  fecha_estimada date,
  fecha_termino date,
  fecha_original date,
  color text,
  tinta_tipo text
)
language sql
security definer
set search_path = public
as $$
  select p.num, p.medida, p.cajas, p.piezas_prod, p.status,
         p.fecha_solicitud, p.fecha_estimada, p.fecha_termino, p.fecha_original,
         p.color, p.tinta_tipo
  from public.pedidos p
  join public.clientes c on c.nombre = p.cliente
  where c.portal_token = p_token;
$$;

grant execute on function public.portal_get_pedidos(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4) Función para el módulo de Clientes (supervisor): obtener o crear
--    el portal_token de un cliente por nombre (para "Copiar link del portal")
-- ---------------------------------------------------------------------
create or replace function public.get_or_create_portal_token(p_nombre text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  select portal_token into v_token from public.clientes where nombre = p_nombre;

  if v_token is not null then
    return v_token;
  end if;

  v_token := lower(regexp_replace(p_nombre, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(md5(random()::text), 1, 6);

  if exists (select 1 from public.clientes where nombre = p_nombre) then
    update public.clientes set portal_token = v_token where nombre = p_nombre;
  else
    insert into public.clientes (nombre, portal_token) values (p_nombre, v_token);
  end if;

  return v_token;
end;
$$;

grant execute on function public.get_or_create_portal_token(text) to anon, authenticated;


-- =====================================================================
-- ROLLBACK (si algo se rompe, corre esto para volver a como estaba)
-- =====================================================================
-- alter table public.clientes disable row level security;
-- drop function if exists public.portal_get_cliente(text);
-- drop function if exists public.portal_get_pedidos(text);
-- drop function if exists public.get_or_create_portal_token(text);
