-- =====================================================================
-- Seguridad Fase 1: cierra dos lecturas publicas con la anon key (la
-- misma key que trae el bundle del sitio, cualquiera la puede sacar del
-- navegador) y amarra la lectura de pedidos a cuentas ACTIVAS.
--
--   1) clientes: la anon key podia leer TODOS los portal_token -> con eso
--      se entra al portal de cualquier cliente. Nadie en el frontend lee
--      la tabla directo (el portal usa portal_get_cliente/portal_get_pedidos,
--      que son security definer), asi que se le quita el acceso a anon y a
--      authenticated sin romper nada.
--   2) get_or_create_portal_token: estaba abierta a anon -> cualquiera
--      sacaba el token de un cliente con solo saber su nombre. Ahora pide
--      sesion con perfil activo y modo supervisor/ventas (o admin), que son
--      los que ven el boton "Copiar link del portal" en Clientes.js.
--   3) pedidos: anon (pizarras publicas /pizarra y /pizarra-rebobinado)
--      sigue leyendo pedidos, pero YA NO costo_pieza, precio_pieza ni
--      margen_pct. Las cuentas con sesion leen todo solo si su perfil esta
--      activo -- "Crear cuenta" en el login esta abierto a cualquiera, y
--      una cuenta recien creada (activo = false) ya no ve nada.
--
-- Se puede correr mas de una vez. Todo va en una transaccion: si algo
-- falla, no se aplica nada.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) clientes
-- ---------------------------------------------------------------------
alter table public.clientes enable row level security;
revoke all on table public.clientes from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) get_or_create_portal_token: solo usuarios activos con permiso
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
  if not exists (
    select 1 from public.perfiles
    where id = auth.uid()
      and activo
      and (es_admin or modos && array['supervisor', 'ventas'])
  ) then
    raise exception 'No autorizado';
  end if;

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

-- Las funciones nuevas traen EXECUTE para PUBLIC por default -- hay que
-- quitarselo a PUBLIC tambien, no solo a anon.
revoke execute on function public.get_or_create_portal_token(text) from public, anon;
grant execute on function public.get_or_create_portal_token(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) pedidos
-- ---------------------------------------------------------------------
create or replace function public.es_usuario_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;
revoke execute on function public.es_usuario_activo() from public, anon;
grant execute on function public.es_usuario_activo() to authenticated;

alter table public.pedidos enable row level security;

-- Se borran TODAS las policies de pedidos (los nombres reales en la base
-- no estan todos en el repo) y se crean las dos de abajo. Las escrituras
-- ya van solo por /api con la service key, que no pasa por RLS.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'pedidos' loop
    execute format('drop policy %I on public.pedidos', pol.policyname);
  end loop;
end $$;

create policy "pedidos_select_anon" on public.pedidos
  for select to anon using (true);
create policy "pedidos_select_activos" on public.pedidos
  for select to authenticated using (public.es_usuario_activo());

-- anon: lectura solo de columnas sin costos, y nada de escritura.
revoke all on table public.pedidos from anon;
grant select (
  id, cliente, num, tipo, medida, cajas, rollos_caja, rollos_totales, ancho, largo,
  color, maq, op, fecha_solicitud, fecha_inicio, fecha_termino, piezas_prod, merma,
  merma_pct, notas, status, created, rollos_usados, tinta_tipo, tinta_kg, alcohol_litros,
  notas_consumo, cliche_url, color_cinta, foto_producto_url, fecha_estimada, orden,
  fecha_original, inicio_ts, fin_ts, stickyback, color2, tinta_kg2, diseno, portaliche,
  diseno2, portaliche2, folio_rebobinado, cliche_id, tarima_jumbo_id, pausas
) on public.pedidos to anon;

commit;

-- ---------------------------------------------------------------------
-- Verificacion (opcional, correr despues):
--   select policyname, roles, cmd from pg_policies where tablename in ('pedidos', 'clientes');
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name in ('pedidos', 'clientes') and grantee in ('anon', 'authenticated');
-- ---------------------------------------------------------------------
